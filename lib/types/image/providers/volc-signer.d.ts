/** Headers the signer returns for the request. */
export interface SignedHeaders {
    readonly 'content-type': string;
    readonly 'x-content-sha256': string;
    readonly 'x-date': string;
    readonly authorization: string;
}
/** Inputs for one signed request. */
export interface SignInput {
    readonly method: string;
    readonly url: URL;
    /** Exact JSON body sent with the request. */
    readonly body: string;
    readonly accessKey: string;
    readonly secretKey: string;
    readonly region: string;
    readonly service: string;
    /** Instant used for the signature; tests inject it. */
    readonly date?: Date;
}
/** AWS canonical URI encoding (spaces are %20; `!'()*` are encoded). */
export declare function awsEncode(value: string): string;
/** @param value - text or bytes. @returns lowercase SHA-256 hex. */
export declare function sha256Hex(value: string | Uint8Array): string;
/**
 * Sign one JSON request.
 * @param input - request and credentials.
 * @returns the headers to send; values never include the secret key.
 */
export declare function signVolcRequest(input: SignInput): SignedHeaders;
