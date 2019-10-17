const STORE_NAMESPACE = 'consolidatedLogs'

export default class ConsolidatedLogs {
  constructor(app) {
    this._app = app

    app.on('clean', () => app.cleanStore(STORE_NAMESPACE))
  }

  getConsolidationLogger() {
    return this._app.getStore(STORE_NAMESPACE)
  }

  async getConsolidatedLogs() {
    const logger = await this.getConsolidationLogger()
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
