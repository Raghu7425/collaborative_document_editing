from internal.collaboration.ot import TextOperation, apply_operation, rebase


def test_concurrent_insert_rebases_after_prior_insert():
    incoming = TextOperation("insert", 3, text="B", base_revision=0)
    committed = [TextOperation("insert", 0, text="A", base_revision=0)]
    rebased = rebase(incoming, committed)
    assert rebased.position == 4
    assert apply_operation("cat", rebased) == "catB"


def test_insert_inside_deleted_range_moves_to_delete_start():
    incoming = TextOperation("insert", 5, text="X", base_revision=0)
    committed = [TextOperation("delete", 2, length=6, base_revision=0)]
    rebased = rebase(incoming, committed)
    assert rebased.position == 2


def test_overlapping_delete_shrinks():
    incoming = TextOperation("delete", 2, length=5, base_revision=0)
    committed = [TextOperation("delete", 4, length=4, base_revision=0)]
    rebased = rebase(incoming, committed)
    assert rebased.position == 2
    assert rebased.length == 2
