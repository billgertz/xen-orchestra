import assert from 'assert'
import levelup from 'level-party'
import sublevel from 'level-sublevel'
import { createPredicate } from 'value-matcher'
import { defer, fromEvent } from 'promise-toolbox'
import { ensureDir } from 'fs-extra'

import { forEach, promisify } from '../utils'

// ===================================================================

async function _levelHas(key) {
  return this.get(key).then(
    () => true,
    error => {
      if (!error.notFound) {
        throw error
      }
      return false
    }
  )
}

// keep n element in the DB
async function _levelGc(keep) {
  assert(typeof keep === 'number')

  let count = 1
  const { promise, resolve } = defer()

  const cb = () => {
    if (--count === 0) {
      resolve()
    }
  }
  const stream = this.createKeyStream({
    reverse: true,
  })

  const deleteEntry = key => {
    ++count
    this.del(key, cb)
  }

  const onData =
    keep !== 0
      ? () => {
          if (--keep === 0) {
            stream.on('data', deleteEntry)
            stream.removeListener('data', onData)
          }
        }
      : deleteEntry
  stream.on('data', onData)

  await fromEvent(stream, 'end')
  cb()

  return promise
}

function _levelGetAll(filter = {}) {
  const isMatch = createPredicate(filter)
  return new Promise((resolve, reject) => {
    const entries = {}
    this.createReadStream()
      .on('data', ({ value, key }) => {
        if (isMatch(value)) {
          entries[key] = value
        }
      })
      .on('end', () => {
        resolve(entries)
      })
      .on('error', reject)
  })
}

const levelMethods = db => {
  db.gc = _levelGc
  db.getAll = _levelGetAll
  db.has = _levelHas

  return db
}

const levelPromise = db => {
  const dbP = {}
  forEach(db, (value, name) => {
    if (typeof value !== 'function') {
      return
    }

    if (name.endsWith('Stream') || name.startsWith('is')) {
      dbP[name] = db::value
    } else {
      dbP[name] = promisify(value, db)
    }
  })

  return dbP
}

// ===================================================================

export default class {
  constructor(xo, config) {
    const dir = `${config.datadir}/leveldb`
    this._db = ensureDir(dir).then(() => {
      return sublevel(
        levelup(dir, {
          valueEncoding: 'json',
        })
      )
    })
  }

  getStore(namespace) {
    return this._db.then(db =>
      levelMethods(levelPromise(db.sublevel(namespace)))
    )
  }
}
