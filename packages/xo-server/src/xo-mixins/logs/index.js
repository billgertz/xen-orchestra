import LevelDbLogger from './loggers/leveldb'

const STORE_NAMESPACE = 'logs'

export default class Logs {
  constructor(app) {
    this._app = app

    app.on('clean', () => app.getStore(STORE_NAMESPACE).then(db => db.clean()))
  }

  getLogger(namespace) {
    return this._app
      .getStore(STORE_NAMESPACE)
      .then(store => new LevelDbLogger(store, namespace))
  }

  async getLogs(namespace) {
    const logger = await this.getLogger(namespace)

    return new Promise((resolve, reject) => {
      const logs = {}

      logger
        .createReadStream()
        .on('data', data => {
          logs[data.key] = data.value
        })
        .on('end', () => {
          resolve(logs)
        })
        .on('error', reject)
    })
  }
}
