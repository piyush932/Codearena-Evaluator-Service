export interface TestCasePayload {
    inputCase: string;
    outputCase: string;
}

export interface SubmissionPayload {
    submissionId: string;
    userId: string;
    code: string;
    language: string;
    testCases: TestCasePayload[];
}