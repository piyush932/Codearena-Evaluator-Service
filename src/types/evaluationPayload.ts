export type EvaluationStatus =
    | "Success"
    | "WA"
    | "RE"
    | "TLE";

export interface EvaluationPayload {
    submissionId: string;
    userId: string;
    status: EvaluationStatus;
    actualOutput: string;
    expectedOutput: string;
    language: string;
    passedTestCases: number;
    totalTestCases: number;
    failedTestCaseIndex: number | null;
    error?: string;
}