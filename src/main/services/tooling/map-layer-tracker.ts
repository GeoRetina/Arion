import type { BrowserWindow } from 'electron'
import type { Feature, Geometry } from 'geojson'
import type { AddedLayerInfo } from '../../llm-tools/map-layer-management-tools'
import type { AddMapFeaturePayload } from '../../../shared/ipc-types'

export class MapLayerTracker {
  private mainWindow: BrowserWindow | null = null
  private readonly addedLayersInfo: Map<string, AddedLayerInfo> = new Map()

  public setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  public recordLayer(info: AddedLayerInfo): void {
    this.addedLayersInfo.set(info.sourceId, info)
  }

  public hasLayer(sourceId: string): boolean {
    return this.addedLayersInfo.has(sourceId)
  }

  public removeLayer(sourceId: string): void {
    this.addedLayersInfo.delete(sourceId)
  }

  public getLayer(sourceId: string): AddedLayerInfo | undefined {
    return this.addedLayersInfo.get(sourceId)
  }

  public listLayers(): AddedLayerInfo[] {
    return Array.from(this.addedLayersInfo.values())
  }

  public clear(): void {
    this.addedLayersInfo.clear()
  }

  public sendFeatureToMap(
    feature: Feature<Geometry>,
    options?: Partial<AddMapFeaturePayload>
  ): void {
    if (!this.mainWindow) {
      return
    }
    const payload: AddMapFeaturePayload = {
      feature,
      fitBounds: options?.fitBounds ?? true,
      sourceId: options?.sourceId
    }
    this.mainWindow.webContents.send('ctg:map:addFeature', payload)
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }
}
