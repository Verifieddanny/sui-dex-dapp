import { SuiEvent } from "@mysten/sui/client";

type SuiEventFilter =
  | { MoveEventType: string }
  | { Package: string }
  | { SenderAddress: string }
  | { All: SuiEventFilter[] }
  | { Any: SuiEventFilter[] }
  | { And: SuiEventFilter[] }
  | { Or: SuiEventFilter[] };

interface SubscribeOptions {
  filter: SuiEventFilter;
  onEvent: (event: SuiEvent) => void;
  onError?: (err: Event) => void;
}

export function subscribeToSuiEvents({
  filter,
  onEvent,
  onError,
}: SubscribeOptions): () => void {
  const ws = new WebSocket("wss://rpc.testnet.sui.io:443");

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_subscribeEvent",
        params: [filter],
      })
    );
  };

  ws.onmessage = (msg: MessageEvent) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.method === "suix_subscribeEvent") {
        const event = data.params.result;
        onEvent(event);
      }
    } catch (error) {
      if (onError) onError(error as Event);
    }
  };

  ws.onerror = (err: Event) => {
    if (onError) onError(err);
  };

  return () => ws.close();
}
