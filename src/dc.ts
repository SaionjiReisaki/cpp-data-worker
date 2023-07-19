export const CONTAINER_TYPE = '@orz/cpp/data-container'
export const CONTAINER_VERSION = 1

export interface IDataContainer<Data = object> {
  '@type': typeof CONTAINER_TYPE
  '@version': typeof CONTAINER_VERSION
  name: string
  version: {
    id: string
    text: string
    timestamp: number
    sources: string[]
  }
  data?: Data
}
