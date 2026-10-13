type QuizQuestion = {
  topic: string;
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: number;
  rationale: string;
};

// Keep answer keys in this server-only module. API routes can select only the
// public fields, while reviews may use the topic and rationale.
export const quizQuestions: QuizQuestion[] = [
  {
    topic: "Processors",
    prompt: "Four cores expose two hardware threads each. How many logical processors does the OS see?",
    choices: ["4 processors","6 processors","8 processors","16 processors"],
    correctIndex: 2,
    rationale: "Each core exposes two hardware threads, so four cores provide eight logical processors. These are schedulable contexts, not eight full physical cores.",
  },
  {
    topic: "Amdahl's law",
    prompt: "Ten percent of a program is serial. What ideal limit remains with infinitely many cores?",
    choices: ["2 times","5 times","10 times","Unlimited"],
    correctIndex: 2,
    rationale: "Amdahl's law leaves the serial 10 percent unchanged, so the ideal limit is 1 divided by 0.10, or 10 times. Real overhead lowers observed speedup.",
  },
  {
    topic: "Thread scheduling",
    prompt: "For 64 software threads, what hardware executes their instructions?",
    choices: ["CPU core hardware","Operating-system scheduler","Thread pool","Work queue"],
    correctIndex: 0,
    rationale: "The operating system schedules software threads onto available logical processors, whose CPU core hardware executes instructions. The scheduler and queue organize work but do not compute results.",
  },
  {
    topic: "Lost updates",
    prompt: "Two threads increment one shared counter without synchronization. What risk can occur?",
    choices: ["One update is overwritten","The increment becomes atomic","The scheduler prevents interleaving","Each thread gets a private copy"],
    correctIndex: 0,
    rationale: "An increment has separate read, add and write steps. If both threads read the same old value, both may write the same replacement and lose one update.",
  },
  {
    topic: "Mutex scope",
    prompt: "To protect a shared increment, which steps go inside the mutex?",
    choices: ["Only the read","Only the write","Read, add, write","Add and write only"],
    correctIndex: 2,
    rationale: "An increment reads a shared value, calculates a replacement, then writes it. Locking all three steps prevents another thread from reading the same old value.",
  },
  {
    topic: "Local counters",
    prompt: "Workers count privately. When do you combine their totals?",
    choices: ["Before workers start","After all workers finish","After each item","During every update"],
    correctIndex: 1,
    rationale: "Once all workers finish, each private total is final. Combining those results once avoids coordinating a shared counter during the hot loop.",
  },
  {
    topic: "File boundaries",
    prompt: "In our file-partition rule, which range owns a line crossing a boundary?",
    choices: ["Range with first byte","Range with last byte","Both, then dedupe","First to read it"],
    correctIndex: 0,
    rationale: "Using the first byte as a line's owner gives every complete line exactly one worker, even when a partition boundary falls inside it.",
  },
  {
    topic: "Backpressure",
    prompt: "A blocking bounded queue is full. What does the producer do?",
    choices: ["Store beyond the limit","Wait for a free slot","Drop the new item","Stop the workers"],
    correctIndex: 1,
    rationale: "A blocking bounded queue applies backpressure: the producer waits until a consumer frees capacity, keeping waiting items within the queue limit.",
  },
  {
    topic: "Empty queue",
    prompt: "The queue is empty, but more work may arrive. What should a worker do?",
    choices: ["Exit now","Wait for work or completion","Keep checking continuously","Add an empty batch"],
    correctIndex: 1,
    rationale: "An empty queue may be temporary. A worker should wait for another item or a completion signal, rather than exiting before input is finished.",
  },
  {
    topic: "Queue completion",
    prompt: "When can workers stop after the producer finishes?",
    choices: ["When reading stops","After no more items can arrive and the queue is empty","On first empty check","When one worker finishes"],
    correctIndex: 1,
    rationale: "The completion signal says no further items will arrive, and draining ensures every accepted batch is processed before workers exit.",
  },
  {
    topic: "Batch size",
    prompt: "Why can one-line batches lower queue throughput?",
    choices: ["Parsing becomes serial","Coordination repeats for little work","Queue loses item order","Workers share one counter"],
    correctIndex: 1,
    rationale: "Each batch needs queue coordination and scheduling. With one line per item, that cost repeats often and can exceed the small amount of work per batch.",
  },
  {
    topic: "Unbounded backlog",
    prompt: "With no queue limit, producers outpace workers. What risk grows?",
    choices: ["Pending work keeps using memory","Queue applies backpressure","Workers auto-scale","Items are discarded"],
    correctIndex: 0,
    rationale: "Without a capacity bound or other backpressure, queued batches remain in memory and can accumulate faster than workers remove them.",
  },
  {
    topic: "Queue memory",
    prompt: "A bounded queue is full while workers hold active batches. What does capacity limit?",
    choices: ["All process memory","Waiting queue items","Waiting plus active batches","The whole input file"],
    correctIndex: 1,
    rationale: "Capacity bounds only items waiting in the queue. Active workers may each hold a batch, while buffers, stacks, and runtime use additional memory.",
  },
  {
    topic: "Shared I/O",
    prompt: "Several threads read the same USB drive. Which limit do they share?",
    choices: ["Device bandwidth and I/O path","Independent bandwidth per file","New USB bandwidth per worker","One device channel per thread"],
    correctIndex: 0,
    rationale: "All requests still use the same device and I/O path. They can overlap, but adding workers does not create additional USB bandwidth.",
  },
  {
    topic: "Network concurrency",
    prompt: "When can concurrent requests to independent servers reduce waiting?",
    choices: ["It reduces each server's processing time","Independent waits can overlap","It guarantees a faster total time","It lowers each request's latency"],
    correctIndex: 1,
    rationale: "Independent requests can overlap while earlier ones wait, reducing elapsed waiting when server and network capacity allow. Concurrency does not remove latency or guarantee speedup.",
  }
];

export function getQuestion(index: number): QuizQuestion | undefined {
  return quizQuestions[index];
}
