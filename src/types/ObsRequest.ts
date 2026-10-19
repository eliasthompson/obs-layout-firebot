export interface ObsRequest {
  requestType: string;
  requestData: Record<string, unknown>;
}

export interface ObsRequestStatus {
  result: boolean;
  code: number;
  comment?: string;
}

export interface ObsBatchResult {
  requestType: string;
  requestStatus: ObsRequestStatus;
  responseData?: Record<string, unknown>;
}

export interface FilterWrite {
  sourceName: string;
  filterName: string;
  filterSettings: Record<string, unknown>;
}
