import Docker from "dockerode";

async function createContainer(
    imageName: string,
    cmdExecutable: string[]
) {
    const docker = new Docker();

    return await docker.createContainer({
        Image: imageName,
        Cmd: cmdExecutable,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        OpenStdin: true,
        HostConfig: {
            Memory: 256 * 1024 * 1024,
            NanoCpus: 1_000_000_000,
            PidsLimit: 64,
            NetworkMode: "none"
        }
    });
}

export default createContainer;