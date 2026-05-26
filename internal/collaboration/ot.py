from dataclasses import dataclass


@dataclass(frozen=True)
class TextOperation:
    type: str
    position: int
    text: str = ""
    length: int = 0
    base_revision: int = 0
    client_operation_id: str = ""

    @property
    def span(self) -> int:
        return len(self.text) if self.type == "insert" else self.length


def apply_operation(content: str, op: TextOperation) -> str:
    position = max(0, min(op.position, len(content)))
    if op.type == "insert":
        return content[:position] + op.text + content[position:]
    if op.type == "delete":
        end = max(position, min(position + op.length, len(content)))
        return content[:position] + content[end:]
    raise ValueError(f"unsupported operation type: {op.type}")


def transform(incoming: TextOperation, committed: TextOperation) -> TextOperation:
    """Transform incoming against one already-committed operation.

    This is single-document linear OT for plain text. The database serializes commits,
    while this function rebases stale client operations onto the latest revision.
    """
    op = incoming
    if committed.type == "insert":
        if op.type == "insert":
            shift = committed.span if committed.position <= op.position else 0
            return TextOperation(op.type, op.position + shift, op.text, op.length, op.base_revision, op.client_operation_id)
        if committed.position < op.position:
            return TextOperation(op.type, op.position + committed.span, op.text, op.length, op.base_revision, op.client_operation_id)
        return op

    if committed.type == "delete":
        deleted_start = committed.position
        deleted_end = committed.position + committed.length
        if op.type == "insert":
            if op.position <= deleted_start:
                return op
            if op.position >= deleted_end:
                return TextOperation(op.type, op.position - committed.length, op.text, op.length, op.base_revision, op.client_operation_id)
            return TextOperation(op.type, deleted_start, op.text, op.length, op.base_revision, op.client_operation_id)

        if op.position >= deleted_end:
            return TextOperation(op.type, op.position - committed.length, op.text, op.length, op.base_revision, op.client_operation_id)
        if op.position + op.length <= deleted_start:
            return op

        start = min(op.position, deleted_start)
        overlap_start = max(op.position, deleted_start)
        overlap_end = min(op.position + op.length, deleted_end)
        new_length = max(0, op.length - (overlap_end - overlap_start))
        return TextOperation(op.type, start, op.text, new_length, op.base_revision, op.client_operation_id)

    return op


def rebase(incoming: TextOperation, committed_after_base: list[TextOperation]) -> TextOperation:
    rebased = incoming
    for committed in committed_after_base:
        rebased = transform(rebased, committed)
    return rebased

