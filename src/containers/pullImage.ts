import Docker from "dockerode";

export default async function pullImage(
    imageName: string
): Promise<void> {
    const docker = new Docker();

    await new Promise<void>((resolve, reject) => {
        docker.pull(
            imageName,
            (
                pullError: Error | null,
                stream: NodeJS.ReadableStream
            ) => {
                if (pullError || !stream) {
                    reject(
                        pullError ||
                        new Error(
                            `Unable to pull image: ${imageName}`
                        )
                    );

                    return;
                }

                docker.modem.followProgress(
                    stream,
                    (progressError: Error | null) => {
                        if (progressError) {
                            reject(progressError);
                            return;
                        }

                        resolve();
                    }
                );
            }
        );
    });
}