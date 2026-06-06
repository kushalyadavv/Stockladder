const COLLECTION_REORDER = `mutation CollectionReorder($id: ID!, $moves: [MoveInput!]!) {
  collectionReorderProducts(id: $id, moves: $moves) {
    job { id done }
    userErrors { field message }
  }
}`;

const MOVES_PER_BATCH = 250;

export function buildMoves(currentIds, desiredIds) {
  const working = [...currentIds];
  const moves = [];

  for (let targetPos = 0; targetPos < desiredIds.length; targetPos++) {
    const productId = desiredIds[targetPos];
    const currentPos = working.indexOf(productId);
    if (currentPos === -1) continue;
    if (currentPos !== targetPos) {
      moves.push({ id: productId, newPosition: String(targetPos) });
      working.splice(currentPos, 1);
      working.splice(targetPos, 0, productId);
    }
  }

  return moves;
}

export async function applyMoves(
  client,
  collectionId,
  moves,
  dryRun,
  collectionTitle,
) {
  if (moves.length === 0) return 0;

  if (dryRun) {
    console.log(
      `  [dry-run] Would reorder ${moves.length} product(s) in "${collectionTitle}"`,
    );
    return moves.length;
  }

  let applied = 0;

  for (let i = 0; i < moves.length; i += MOVES_PER_BATCH) {
    const batch = moves.slice(i, i + MOVES_PER_BATCH).map((m) => ({
      id: m.id,
      newPosition: String(m.newPosition),
    }));
    const data = await client.graphql(COLLECTION_REORDER, {
      id: collectionId,
      moves: batch,
    });

    const errors = data.collectionReorderProducts?.userErrors ?? [];
    if (errors.length) {
      throw new Error(
        `collectionReorderProducts failed: ${errors.map((e) => e.message).join(", ")}`,
      );
    }

    const job = data.collectionReorderProducts?.job;
    if (job?.id && !job.done) {
      await client.waitForJob(job.id);
    }

    applied += batch.length;
  }

  return applied;
}
