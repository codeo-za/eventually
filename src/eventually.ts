export type EventualFunction<T> = (...args: any[]) => Promise<T>;

export type ErrorHandler =
    (e: Error) => Promise<ErrorHandlingStrategies> |
        Promise<IEventuallyOptions<any>>;

export type RedirectingErrorHandler<T> =
    (e: Error) => Promise<IRedirectingEventuallyOptions<T>>;

export type ICompositeErrorHandler<T> =
    (e: Error) => Promise<IRedirectingEventuallyOptions<T> |
        ErrorHandlingStrategies>;

export interface IEventuallyOptions<T> {
    retries?: number;
    fail?: ErrorHandler | RedirectingErrorHandler<T> | ICompositeErrorHandler<T>;
    backoff?: number[] | number;
}

export interface IRedirectingEventuallyOptions<T> extends IEventuallyOptions<T> {
    redirect?: (e: Error) => Promise<T>;
}

export enum ErrorHandlingStrategies {
    fail = 1,  // pass on the failure
    halt = 2,  // stop the promise chain right here
    suppress = 3,  // completes the chain, but resolves undefined
    retry = 4  // just try again
}

function omit<T>(obj: T, ...props: string[]): Partial<T> {
    const lookup = new Set(props);
    return Object.keys(obj).reduce(
        (acc, cur) => {
            if (!lookup.has(cur)) {
                acc[cur as keyof T] = obj[cur as keyof T];
            }
            return acc;
        }, {} as Partial<T>);
}

function ensureArray(value: number[] | number): number[] {
    return Array.isArray(value)
        ? value
        : [ value ];
}

export async function eventually<T>(
    func: EventualFunction<T>,
    options?: IEventuallyOptions<T> | IRedirectingEventuallyOptions<T>
): Promise<T | undefined> {
    options = resolveOptions<T>(options);
    let lastError: Error;
    try {
        const
            retries = options.retries || defaultRetries,
            backoff = options.backoff || defaultBackoff;
        return await tryDo(func, retries, ensureArray(backoff));
    } catch (e) {
        lastError = e;
    }

    const
        redirecting = options as IRedirectingEventuallyOptions<T>,
        redirect = redirecting.redirect;
    if (redirect) {
        return await eventually(
            () => redirect(lastError),
            omit(options, "redirect") as IEventuallyOptions<T>
        );
    }

    const fail = options.fail;
    if (fail === undefined) {
        throw lastError;
    }

    const handlerResult = await fail(lastError) as IRedirectingEventuallyOptions<T>;
    if (typeof handlerResult === "object") {
        return await handleComplexEventualFailResult(handlerResult, func, lastError);
    }
    return handleSimpleEventuallyResult(
        handlerResult,
        func,
        options,
        lastError
    );
}

let
    defaultRetries = 0,
    defaultFailHandler: ErrorHandler = async () => ErrorHandlingStrategies.fail,
    defaultBackoff = [] as number[];

export function configureDefaults(
    opts: IEventuallyOptions<any>
) {
    if (opts.retries !== undefined) {
        defaultRetries = opts.retries;
    }
    if (opts.fail !== undefined) {
        defaultFailHandler = opts.fail as ErrorHandler;
    }
    if (opts.backoff !== undefined) {
        defaultBackoff = ensureArray(opts.backoff)
    }
}

const defaultOptions: IEventuallyOptions<any> = {
    retries: defaultRetries,
    fail: defaultFailHandler,
    backoff: defaultBackoff
};

function resolveOptions<T>(options?: IEventuallyOptions<T> | IRedirectingEventuallyOptions<T>) {
    if (!options) {
        return defaultOptions;
    }
    Object.keys(defaultOptions).forEach(key => {
        const k = key as keyof IEventuallyOptions<T>;
        if (options[k] === undefined) {
            // @ts-ignore
            options[k as keyof IEventuallyOptions] = defaultOptions[k];
        }
    });
    return options;
}

export async function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}

async function tryDo<T>(
    func: EventualFunction<T>,
    retries: number,
    backoff: number[]
) {
    backoff = backoff.slice(); // get a copy, so we can shift
    const fallbackBackoff = backoff[backoff.length - 1] || 0;
    let attempts = 0, lastError: Error;
    do {
        if (attempts > 0) {
            const backoffMs = backoff.shift() || fallbackBackoff;
            await sleep(backoffMs);
        }
        try {
            return await func();
        } catch (e) {
            lastError = e;
        }
    } while (attempts++ < retries);
    throw lastError;
}

async function handleComplexEventualFailResult<T>(
    options: IRedirectingEventuallyOptions<T>,
    originalFunction: EventualFunction<T>,
    lastError: Error) {
    const redirect = options.redirect;
    if (redirect) {
        return await eventually(
            () => {
                return redirect(lastError);
            },
            omit(options, "redirect")
        );
    } else {
        return await eventually(originalFunction, options);
    }
}

async function handleSimpleEventuallyResult<T>(
    strategy: ErrorHandlingStrategies,
    func: EventualFunction<T>,
    options: IEventuallyOptions<T> | IRedirectingEventuallyOptions<T>,
    lastError: Error): Promise<T | undefined> {
    switch (strategy) {
        case ErrorHandlingStrategies.fail:
            throw lastError;
        case ErrorHandlingStrategies.retry:
            return await eventually(func, options);
        case ErrorHandlingStrategies.halt:
            return new Promise(() => {
                /* intentionally left empty, promise-chain is suppressed */
            });
        case ErrorHandlingStrategies.suppress:
            return; // caller will get 'undefined'
        default:
            throw new Error(`Unhandled failure strategy "${
                strategy
            }"\noriginal error follows:\n${
                lastError.message
            }\n${
                lastError.stack
            }`);
    }
}
