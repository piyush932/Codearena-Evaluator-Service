export type ExecutionStatus =
    | "SUCCESS"
    | "WA"
    | "TLE"
    | "RE";

export interface ExecutionResponse {
    output: string;
    status: ExecutionStatus;
}

export default interface CodeExecutorStrategy {
    execute(
        code: string,
        inputTestCase: string,
        outputTestCase: string
    ): Promise<ExecutionResponse>;
}