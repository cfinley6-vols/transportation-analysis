// SQL for TIME_BLOCKS.

export function listTimeBlocks(db) {
  return db.prepare(
    `SELECT TimeBlockID, BlockName, StartTime, EndTime
       FROM TIME_BLOCKS
      ORDER BY StartTime`,
  ).all();
}

export function findTimeBlock(db, timeBlockId) {
  return db.prepare(
    `SELECT TimeBlockID, BlockName, StartTime, EndTime
       FROM TIME_BLOCKS
      WHERE TimeBlockID = ?`,
  ).get(timeBlockId);
}
