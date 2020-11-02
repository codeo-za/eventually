import {
    ErrorHandlingStrategies,
    eventually,
    ICompositeErrorHandler,
    IEventuallyOptions,
    IRedirectingEventuallyOptions,
    sleep
} from "../src";
import "expect-more-jest";
import * as faker from "faker";
import { company, random } from "faker";

describe(`eventually`, () => {
    describe(`usage`, () => {
        it(`should run a given function which produces a promise`, async () => {
            // Arrange
            const
                expected = company.bs(),
                func = () => Promise.resolve(expected);
            // Act
            const result = await eventually(func);
            // Assert
            expect(result).toEqual(expected);
        });

        it(`given retries, should retry and return`, async () => {
            // Arrange
            let hits = 0;
            const
                expected = company.bs(),
                func = () => {
                    if (++hits > 1) {
                        return Promise.resolve(expected);
                    }
                    return Promise.reject("FAIL");
                };
            // Act
            const result = await eventually(func, { retries: 1 });
            // Assert
            expect(result).toEqual(expected);
        });

        it(`should reject when the retry count is exceeded`, async () => {
            // Arrange
            let hits = 0;
            const
                expected = company.bs(),
                func = () => {
                    if (++hits > 3) {
                        return Promise.resolve(expected);
                    }
                    return Promise.reject("FAIL");
                };
            // Act
            // await eventually(func, { retries: 1 });
            await expect(eventually(func, { retries: 1 }))
                .rejects.toMatch("FAIL");
            // Assert
        });

        it(`should call the provided error callback instead of throwing if provided`, async () => {
            // Arrange
            let called = false;
            const
                func = () => {
                    return Promise.reject(company.bs());
                },
                options = {
                    fail: async (e) => {
                        called = true;
                        return ErrorHandlingStrategies.suppress;
                    }
                } as IEventuallyOptions<any>;
            // Act
            // suppress the failure -- in this case, the result is undefined
            //  -> which sucks for the caller, but they had to opt in for it
            //  -> and it doesn't lock up await (which `halt` will do -- the original
            //          promise _never_ resolves
            const result = await eventually(func, options);
            // Assert
            expect(called).toBeTrue();
            expect(result).not.toBeDefined();
        });

        it(`should halt execution when func rejects and stategy is halt`, async () => {
            // Arrange
            let called = false;
            const
                func = () => {
                    return Promise.reject(company.bs());
                },
                options = {
                    fail: async (e) => {
                        return ErrorHandlingStrategies.halt;
                    }
                } as IEventuallyOptions<any>;

            // Act
            eventually(func, options).then(() => {
                called = true;
            });
            // Assert
            await sleep(1000);
            expect(called).toBeFalse();
        });

        it(`should retry if the result strategy is retry`, async () => {
            // Arrange
            let calls = 0;
            const
                expected = company.bs(),
                func = () => {
                    return ++calls > 1
                        ? Promise.resolve(expected)
                        : Promise.reject(company.bs());
                },
                options = {
                    retries: 0,
                    fail: async (e) => {
                        return ErrorHandlingStrategies.retry;
                    }
                } as IEventuallyOptions<any>;
            // Act
            const result = await eventually(func, options);
            // Assert
            expect(result).toEqual(expected);
        });

        it(`should retry with the new options if the fail func returns options`, async () => {
            // Arrange
            let calls = 0;
            let currentError: string;
            const
                secondError = company.bs(),
                func = () => {
                    return Promise.reject(currentError);
                },
                options = {
                    retries: random.number({ min: 1, max: 5 }),
                    fail: async (e1) => {
                        // we swap out the error, so we know
                        //  that this was retried due to these options
                        //  having a fail handler which would accept failure
                        currentError = secondError;
                        calls = 0;
                        return {
                            retry: 0,
                            fail: async (e2) => {
                                return ErrorHandlingStrategies.fail;
                            }
                        };
                    }
                } as IEventuallyOptions<any>;
            // Act
            currentError = company.bs();

            await expect(eventually(func, options))
                .rejects.toMatch(secondError);
            // Assert
        });

        it(`should allow redirection of the promise logic`, async () => {
            // Arrange
            const
                error = company.bs(),
                expected = company.bs(),
                originalFunc = () => {
                    return Promise.reject(error);
                },
                redirectFunc = () => {
                    return Promise.resolve(expected);
                },
                options: IRedirectingEventuallyOptions<string> = {
                    retries: random.number({ min: 1, max: 5 }),
                    redirect: redirectFunc,
                    fail: async (e1) => {
                        return ErrorHandlingStrategies.fail;
                    }
                };
            // Act
            const result = await eventually(originalFunc, options);
            // Assert
            expect(result).toEqual(expected);
        });

        it(`should allow redirection from fail handler`, async () => {
            // Arrange
            const
                error = company.bs(),
                expected = company.bs(),
                originalFunc = () => {
                    return Promise.reject(error);
                },
                redirectFunc = () => {
                    return Promise.resolve(expected);
                },
                options: IEventuallyOptions<any> = {
                    retries: 0,
                    fail: async (e) => {
                        return {
                            retry: 0,
                            redirect: redirectFunc,
                            fail: async (e2) => ErrorHandlingStrategies.fail
                        };
                    }
                };
            // Act
            const result = await eventually(originalFunc, options);
            // Assert
            expect(result).toEqual(expected);
        });

        it(`should allow redirection or strategy from the fail handler (redirect)`, async () => {
            // Arrange
            const
                error = company.bs(),
                shouldRedirect = true,
                expected = company.bs(),
                originalFunc = () => {
                    return Promise.reject(error);
                },
                redirectFunc = () => {
                    return Promise.resolve(expected);
                },
                fail: ICompositeErrorHandler<string> = async (e) => {
                    if (shouldRedirect) {
                        return {
                            retry: 0,
                            redirect: redirectFunc,
                            fail: async (e2) => ErrorHandlingStrategies.fail
                        };
                    }
                    return ErrorHandlingStrategies.fail;
                },
                options: IRedirectingEventuallyOptions<string> = {
                    retries: 0,
                    fail
                };
            // Act
            const result = await eventually(originalFunc, options);
            // Assert
            expect(result).toEqual(expected);
        });

        it(`should allow redirection or strategy from the fail handler (redirect)`, async () => {
            // Arrange
            const
                error = company.bs(),
                shouldRedirect = false,
                expected = company.bs(),
                originalFunc = () => {
                    return Promise.reject(error);
                },
                redirectFunc = () => {
                    return Promise.resolve(expected);
                },
                fail: ICompositeErrorHandler<string> = async (e) => {
                    if (shouldRedirect) {
                        return {
                            retry: 0,
                            redirect: redirectFunc,
                            fail: async (e2) => ErrorHandlingStrategies.fail
                        };
                    }
                    return ErrorHandlingStrategies.fail;
                },
                options: IRedirectingEventuallyOptions<string> = {
                    retries: 0,
                    fail
                };
            // Act
            await expect(eventually(originalFunc, options))
                .rejects.toMatch(error);
            // Assert
        });

        describe(`retries with backoff`, () => {
            it(`should back off pretty close to the requested backoff times`, async () => {
                // Arrange
                const
                    callTimes = [] as number[],
                    backoff1 = faker.random.number({ min: 101, max: 110}),
                    backoff2 = 300,
                    // turns out that the browser (or node, in this case) can be quite
                    //  lax about when a setTimeout actually fires. In addition, it can
                    //  clamp the setTimeout call to a time _slightly earlier_ than
                    //  requested. `setTimeout(fn, timeout)` is really more of a hint
                    //  than a guaranteed event. C'est la vie.
                    // tslint:disable-next-line:max-line-length
                    // https://stackoverflow.com/questions/21097421/what-is-the-reason-javascript-settimeout-is-so-inaccurate
                    allowedEarlyInaccuracy = 15,
                    func = async () => {
                        callTimes.push(new Date().getTime());
                        return Promise.reject(`Failing call ${ callTimes.length }`);
                    },
                    options: IEventuallyOptions<any> = {
                        retries: 3,
                        backoff: [backoff1, backoff2],
                        fail: async () => {
                            return ErrorHandlingStrategies.fail;
                        }
                    };
                const spy = spyOn(global, "setTimeout").and.callThrough();
                // Act
                try {
                    await eventually(func, options);
                } catch (e) {
                    const message = e.message || e;
                    expect(message).toEqual("Failing call 4");
                    expect(callTimes.length).toEqual(4);

                    expect(spy).toHaveBeenCalledWith(jasmine.any(Function), backoff1);
                    expect(spy).toHaveBeenCalledWith(jasmine.any(Function), backoff2);

                    const delta1 = callTimes[1] - callTimes[0];
                    // load on the machine may make this value greater than
                    //  expected as well, but there's no guaranteed window
                    //  within the call _must_ have happened, so placing
                    //  an upper bound on the expected deltas is not
                    //  necessarily useful
                    expect(delta1).toBeGreaterThan(backoff1 - allowedEarlyInaccuracy);

                    const delta2 = callTimes[2] - callTimes[1];
                    expect(delta2).toBeGreaterThan(backoff2 - allowedEarlyInaccuracy);
                }
                // Assert
            });
        });
    });
});
