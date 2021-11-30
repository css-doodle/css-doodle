
export interface CSSDoodleElement extends HTMLElement {
    grid: string,
    use: string,
    seed: string,
    update: (styles?: string) => void,
    export: (options?: {
        // Scale factor of the exported image. Default 1.
        scale?: number
        // Returns detailed information of the image, eg. blob size. Default false.
        detail?: boolean
        // Download the image or not. Default false.
        download?: boolean
        // Saved name for download. Defaults to be the current timestamp.
        name?: string
    }) => Promise<{ width: number, height: number, svg: string, blob?: Blob, source?: string }>
}
