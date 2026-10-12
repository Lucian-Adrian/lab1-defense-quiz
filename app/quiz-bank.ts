type QuizQuestion = {
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: number;
  rationale: string;
};

// Keep answer keys in this server-only module. API routes import this file;
// client components receive prompts and choices from the API only.
export const quizQuestions: QuizQuestion[] = [
  {
    prompt: "A CPU has 4 physical cores and 2 hardware threads per core. How many logical processors can the OS schedule?",
    choices: ["2", "4", "8", "16"],
    correctIndex: 2,
    rationale: "Each physical core exposes two hardware threads, so the OS sees eight logical processors.",
  },
  {
    prompt: "If 10% of a program is serial, what is its theoretical maximum speedup with infinitely many workers?",
    choices: ["2×", "5×", "10×", "Unlimited"],
    correctIndex: 2,
    rationale: "The serial 10% remains, so Amdahl's law caps speedup at 1 ÷ 0.10 = 10.",
  },
  {
    prompt: "You created 64 threads. Which part actually executes instructions?",
    choices: ["CPU cores", "Software threads", "The queue", "The input file"],
    correctIndex: 0,
    rationale: "CPU execution hardware runs instructions; the OS schedules software threads onto available physical or logical processors, with overhead as thread counts grow.",
  },
  {
    prompt: "Two threads run `count++` without synchronization. What can happen?",
    choices: ["A lost update", "The increment becomes atomic", "The counter resets", "The threads merge"],
    correctIndex: 0,
    rationale: "The read, add, and write are separate steps, so both threads can read the same old value and overwrite one increment.",
  },
  {
    prompt: "What should a mutex protect when several threads increment a shared counter?",
    choices: ["Only the final write", "Only the read", "The whole read-modify-write", "The thread creation"],
    correctIndex: 2,
    rationale: "Locking the complete read-modify-write sequence prevents another thread from using the same old value.",
  },
  {
    prompt: "Each worker counts in a private local variable. When should the program combine those totals?",
    choices: ["Before workers start", "After all workers join", "Every loop iteration", "While holding one global lock"],
    correctIndex: 1,
    rationale: "After joining, each local total is complete and can be combined once without locking every increment.",
  },
  {
    prompt: "A file line crosses a byte-offset partition. Which worker owns that line?",
    choices: ["The worker whose range contains the line's first byte", "The worker whose range contains its last byte", "Both workers that share the boundary", "The worker that reads it fastest"],
    correctIndex: 0,
    rationale: "Assigning a line by the byte offset of its first byte gives one worker a clear ownership decision at a partition boundary.",
  },
  {
    prompt: "A bounded work queue is full. What should its producer do?",
    choices: ["Discard the next item", "Wait until space is available", "Create an unbounded second queue", "Close the workers"],
    correctIndex: 1,
    rationale: "A bounded queue applies backpressure by making the producer wait for a free slot.",
  },
  {
    prompt: "A worker checks an empty queue that may receive more work. What should it do?",
    choices: ["Read a random item", "Wait for work or a completion signal", "Declare the whole task done", "Grow the queue limit"],
    correctIndex: 1,
    rationale: "An empty queue is temporary until the producer signals that no more work will arrive.",
  },
  {
    prompt: "When can queue workers stop safely after input has ended?",
    choices: ["As soon as the producer closes", "After queued work drains", "When one worker finishes", "Before the last batch"],
    correctIndex: 1,
    rationale: "Workers must finish queued items before they exit after end-of-input is signaled.",
  },
  {
    prompt: "Why can a queue of one-line batches run slowly?",
    choices: ["Batches cannot be counted", "Coordination can cost more than the work", "The queue disables the CPU", "Files become larger"],
    correctIndex: 1,
    rationale: "Tiny batches add frequent synchronization and scheduling overhead around very little useful work.",
  },
  {
    prompt: "A producer is faster than its workers and the queue has no limit. What is the main risk?",
    choices: ["The backlog can consume growing memory", "The queue becomes bounded", "The workers duplicate every item", "The producer loses its CPU core"],
    correctIndex: 0,
    rationale: "An unbounded queue can retain work faster than workers consume it, allowing memory use to grow.",
  },
  {
    prompt: "What does a bounded queue limit when workers are busy?",
    choices: ["All memory used by the process", "Only pending queued batches", "The number of active workers", "The size of every source file"],
    correctIndex: 1,
    rationale: "A queue limit bounds waiting batches, while active workers can still each hold their own batch in memory.",
  },
  {
    prompt: "Several workers read files from the same USB device. Which resource may limit their combined throughput?",
    choices: ["The device and its shared I/O path", "Only each worker's private cache", "The number of file names", "The desktop resolution"],
    correctIndex: 0,
    rationale: "Workers can share the USB device's bandwidth and controller, so adding readers may not add device throughput.",
  },
  {
    prompt: "Why can concurrent requests to independent network servers reduce waiting time?",
    choices: ["They remove all network latency", "One request can wait while another makes progress", "They force one server to finish first", "They turn I/O into CPU work"],
    correctIndex: 1,
    rationale: "Independent requests can overlap their waits when server and network capacity allow it.",
  },
];

export function getQuestion(index: number): QuizQuestion | undefined {
  return quizQuestions[index];
}
