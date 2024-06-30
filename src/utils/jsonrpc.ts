export interface BaseJsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
}

export interface JsonRpcResult<ResultType = unknown> extends BaseJsonRpcResponse {
  result: ResultType,
}

export interface JsonRpcError<ErrorDataType = unknown> extends BaseJsonRpcResponse {
  error: { code: number, message: string, data?: ErrorDataType }
}

export function isNotError(data: JsonRpcResult | JsonRpcError): data is JsonRpcResult {
  return 'result' in data && null != data.result;
}

export function isError(data: JsonRpcResult | JsonRpcError): data is JsonRpcError {
  return 'error' in data && null != data.error;
}
