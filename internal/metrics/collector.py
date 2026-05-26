from prometheus_client import Counter, Gauge, Histogram

ACTIVE_SOCKETS = Gauge("collab_active_sockets", "Active WebSocket connections")
ACTIVE_DOCUMENTS = Gauge("collab_active_documents", "Documents with active collaborators")
OPERATIONS_TOTAL = Counter("collab_operations_total", "Committed document operations")
RECONNECTS_TOTAL = Counter("collab_reconnects_total", "WebSocket reconnect recoveries")
SOCKET_LATENCY = Histogram("collab_socket_message_latency_seconds", "WebSocket message handling latency")

