// Prerequisite graph over the platform's 12-topic DSA taxonomy.
// An edge p -> t means p should be reasonably solid before t is scheduled.
export const TOPICS = [
  "arrays", "strings", "hash-tables", "sorting", "linked-lists", "stacks",
  "queues", "recursion", "trees", "heaps", "graphs", "dynamic-programming",
];

export const PREREQS = {
  arrays: [],
  strings: ["arrays"],
  "hash-tables": ["arrays"],
  sorting: ["arrays"],
  "linked-lists": ["arrays"],
  stacks: ["arrays", "linked-lists"],
  queues: ["arrays", "linked-lists"],
  recursion: ["arrays"],
  trees: ["recursion", "linked-lists"],
  heaps: ["trees", "sorting"],
  graphs: ["trees", "queues", "hash-tables"],
  "dynamic-programming": ["recursion", "arrays"],
};
