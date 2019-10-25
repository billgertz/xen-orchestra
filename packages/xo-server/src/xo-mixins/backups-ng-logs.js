import asyncMap from '@xen-orchestra/async-map'
import createLogger from '@xen-orchestra/log'
import ms from 'ms'
import { forEach, isEmpty, iteratee, sortedIndexBy } from 'lodash'

import { debounceWithKey } from '../_pDebounceWithKey'

const consoleLogger = createLogger('xo:xo-mixins:backups-ng-logs')

const STORE_NAMESPACE = 'consolidatedLogs'

const isSkippedError = error =>
  error.message === 'no disks found' ||
  error.message === 'no VMs match this pattern' ||
  error.message === 'unhealthy VDI chain'

const getStatus = (
  error,
  status = error === undefined ? 'success' : 'failure'
) => (status === 'failure' && isSkippedError(error) ? 'skipped' : status)

const computeStatusAndSortTasks = (status, tasks) => {
  if (status === 'failure' || tasks === undefined) {
    return status
  }

  for (let i = 0, n = tasks.length; i < n; ++i) {
    const taskStatus = tasks[i].status
    if (taskStatus === 'failure') {
      return taskStatus
    }
    if (taskStatus === 'skipped') {
      status = taskStatus
    }
  }

  tasks.sort(taskTimeComparator)

  return status
}

function getPropertyValue(key) {
  return this[key]
}

const taskTimeComparator = ({ start: s1, end: e1 }, { start: s2, end: e2 }) => {
  if (e1 !== undefined) {
    if (e2 !== undefined) {
      // finished tasks are ordered by their end times
      return e1 - e2
    }
    // finished task before unfinished tasks
    return -1
  } else if (e2 === undefined) {
    // unfinished tasks are ordered by their start times
    return s1 - s2
  }
  // unfinished task after finished tasks
  return 1
}

// type Task = {
//   data: any,
//   end?: number,
//   id: string,
//   jobId?: string,
//   jobName?: string,
//   message?:  'backup' | 'metadataRestore' | 'restore',
//   scheduleId?: string,
//   start: number,
//   status: 'pending' | 'failure' | 'interrupted' | 'skipped' | 'success',
//   tasks?: Task[],
// }
export default class BackupNgLogs {
  constructor(app) {
    this._app = app
    this.getBackupNgLogs = debounceWithKey(
      this.getBackupNgLogs,
      10e3,
      runId => runId
    )

    app.on('clean', () => app.getStore(STORE_NAMESPACE).then(db => db.clean()))
  }

  async getBackupNgLogs(runId?: string) {
    const consolidatedLogsStore = await this._app.getStore(STORE_NAMESPACE)

    const [
      jobLogs,
      restoreLogs,
      restoreMetadataLogs,
      storedConsolidatedLogs,
    ] = await Promise.all([
      this.getLogs('jobs'),
      this.getLogs('restore'),
      this.getLogs('metadataRestore'),
      new Promise((resolve, reject) => {
        const logs = {}
        consolidatedLogsStore
          .createReadStream()
          .on('data', data => {
            logs[data.key] = data.value
          })
          .on('end', () => {
            resolve(logs)
          })
          .on('error', reject)
      }),
    ])

    if (runId !== undefined && storedConsolidatedLogs[runId] !== undefined) {
      return storedConsolidatedLogs[runId]
    }

    const { runningJobs, runningRestores, runningMetadataRestores } = this
    const consolidated = {}
    const started = {}

    // used in order to clean subtasks when the global task finish
    const tasksByTopParent = {}
    // an optimization to get the hight level parent
    const taskWithTopParent = {}

    const finishedTasks = []
    const storeConsolidatedLogs = async () => {
      const logger = await this.getStore('logs')
      return asyncMap(finishedTasks, async id => {
        await consolidatedLogsStore.put(id, consolidated[id])
        return asyncMap(tasksByTopParent[id], id => logger.del(id))
      })
    }

    const handleLog = ({ data, time, message }, id) => {
      const { event } = data
      if (event === 'job.start') {
        if (
          (data.type === 'backup' || data.key === undefined) &&
          (runId === undefined || runId === id)
        ) {
          const { scheduleId, jobId } = data
          const status = runningJobs[jobId] === id ? 'pending' : 'interrupted'
          consolidated[id] = started[id] = {
            data: data.data,
            id,
            jobId,
            jobName: data.jobName,
            message: 'backup',
            scheduleId,
            start: time,
            status,
          }
          if (status === 'interrupted') {
            finishedTasks.push(id)
          }
          tasksByTopParent[id] = [id]
        }
      } else if (event === 'job.end') {
        const { runJobId } = data
        const log = started[runJobId]
        if (log !== undefined) {
          delete started[runJobId]
          log.end = time
          log.status = computeStatusAndSortTasks(
            getStatus((log.result = data.error)),
            log.tasks
          )

          tasksByTopParent[runJobId].push(id)
          finishedTasks.push(runJobId)
        }
      } else if (event === 'task.start') {
        const task = {
          data: data.data,
          id,
          message,
          start: time,
        }
        const { parentId } = data
        let parent
        if (parentId === undefined && (runId === undefined || runId === id)) {
          // top level task
          task.status =
            (message === 'restore' && !runningRestores.has(id)) ||
            (message === 'metadataRestore' && !runningMetadataRestores.has(id))
              ? 'interrupted'
              : 'pending'
          consolidated[id] = started[id] = task

          if (task.status === 'interrupted') {
            finishedTasks.push(id)
          }
          tasksByTopParent[id] = [id]
        } else if ((parent = started[parentId]) !== undefined) {
          // sub-task for which the parent exists
          task.status = parent.status
          started[id] = task
          ;(parent.tasks || (parent.tasks = [])).push(task)

          const topParent = taskWithTopParent[parentId] ?? parentId
          taskWithTopParent[id] = topParent
          tasksByTopParent[topParent].push(id)
        }
      } else if (event === 'task.end') {
        const { taskId } = data
        const log = started[taskId]
        if (log !== undefined) {
          // TODO: merge/transfer work-around
          delete started[taskId]
          log.end = time
          log.status = computeStatusAndSortTasks(
            getStatus((log.result = data.result), data.status),
            log.tasks
          )

          tasksByTopParent[taskWithTopParent[taskId] ?? taskId].push(id)

          // top level task
          if (tasksByTopParent[taskId] !== undefined) {
            finishedTasks.push(taskId)
          }
        }
      } else if (event === 'task.warning') {
        const parent = started[data.taskId]
        if (parent !== undefined) {
          ;(parent.warnings || (parent.warnings = [])).push({
            data: data.data,
            message,
          })
          tasksByTopParent[taskWithTopParent[parent.id] ?? parent.id].push(id)
        }
      } else if (event === 'task.info') {
        const parent = started[data.taskId]
        if (parent !== undefined) {
          ;(parent.infos || (parent.infos = [])).push({
            data: data.data,
            message,
          })
          tasksByTopParent[taskWithTopParent[parent.id] ?? parent.id].push(id)
        }
      } else if (event === 'jobCall.start') {
        const parent = started[data.runJobId]
        if (parent !== undefined) {
          ;(parent.tasks || (parent.tasks = [])).push(
            (started[id] = {
              data: {
                type: 'VM',
                id: data.params.id,
              },
              id,
              start: time,
              status: parent.status,
            })
          )
        }
      } else if (event === 'jobCall.end') {
        const { runCallId } = data
        const log = started[runCallId]
        if (log !== undefined) {
          delete started[runCallId]
          log.end = time
          log.status = computeStatusAndSortTasks(
            getStatus((log.result = data.error)),
            log.tasks
          )
        }
      }
    }

    forEach(jobLogs, handleLog)
    forEach(restoreLogs, handleLog)
    forEach(restoreMetadataLogs, handleLog)

    storeConsolidatedLogs().catch(error => {
      consoleLogger.warn('Error on storing consolidated logs', {
        error,
      })
    })

    return runId === undefined
      ? { ...consolidated, ...storedConsolidatedLogs }
      : consolidated[runId]
  }

  async getBackupNgLogsSorted({ after, before, filter, limit }) {
    let logs = await this.getBackupNgLogs()

    // convert to array
    logs = Object.keys(logs).map(getPropertyValue, logs)

    if (!isEmpty(filter)) {
      logs = logs.filter(iteratee(filter))
    }

    logs.sort((a, b) => a.start - b.start)

    // only extract the range we are interested in
    const i =
      after === undefined
        ? 0
        : sortedIndexBy(
            logs,
            {
              start: typeof after === 'number' ? after : Date.now() - ms(after),
            },
            'start'
          )
    let j =
      before === undefined
        ? logs.length
        : sortedIndexBy(
            logs,
            {
              start:
                typeof before === 'number' ? before : Date.now() - ms(before),
            },
            'start'
          )

    limit += i
    if (limit < j) {
      j = limit
    }
    logs = logs.slice(i, j)

    return logs
  }
}
