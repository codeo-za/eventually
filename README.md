eventually
---
Retry async operations with back-off, handle errors by halting, suppressing or failing.

Examples
---

1. Easily retry an async function up to 3 times, throwing if the last attempt fails
    ```typescript
    import { eventually } from "@codeo/eventually";
    const result = await eventually(() => queryApi(1, 2, 3), { retries: 3 });
    ```

2. Retry an async function with a back-off strategy: the passed array is
a set of millisecond values to back off by. Once the last one is reached,
that value is used for any further delays to retry attempts. If the following
code were to fail all 5 times, it would back off by 50ms on the second attempt,
250ms on the third attempts, 1 second on the fourth and fifth attempts.
    ```typescript
    import { eventually } from "@codeo/eventually";
    const result = await eventually(() => queryApi("user input"), {
        retries: 5,
        backoff: [ 50, 250, 1000 ]
    });
    ```

    `backoff` may also be specified as a single numeric value to use for all attempts.

3. Halt on error: the promise never resolves. Useful for, eg, polling code where
it's ok for an occasional failure or where failures are simply non-fatal, such as
polling for an unread message count, which can fail when your app is backgrounded.
    ```typescript
   import { eventually, ErrorHandlingStrategies } from "@codeo/eventually";
   const result = await eventually(() => poll("message-count"), {
       retries: 2,
       fail: async(e) => {
           return ErrorHandlingStrategies.halt;
       }
   });
   // if the above fails completely, then this part of code is never reached
   console.log(`you have ${result} messages`);
    ```

4. Suppress an error: in this case, the caller continues with execution (will not
halt the promise chain or cause an await to "deadlock") and `undefined` is returned
to the caller. Since `fail` is an async function, you may choose how to proceed based on the
error you've received. Possible strategies are:
    -   fail     ->  pass on the failure
    -   halt     ->  stop the promise chain right here
    -   suppress -> completes the chain, but resolves undefined
    -   retry    -> just try again
    ```typescript
    import { eventually, ErrorHandlingStrategies } from "@codeo/eventually";
    const result = await eventually(() => willFail(), {
        retries: 1,
        fail: async(e: Error) => {
            return ErrorHandlingStrategies.suppress;
        }
    });
    ```
   
5. Your `fail` handler may even return a new `IEventuallyOptions` object to 
    completely change the flow of logic

6. In addition, you may redirect errors with the `redirect` property on the provided
options, for instance when you have a valid value to fall back on when your async
function fails:
    ```typescript
    import { eventually } from "@codeo/eventually";
    const fallbackValue = 1;
    const result = await eventually(pollServer, {
       redirect: (e: Error) => fallbackValue
    });
    ```
    which you could use to query a secondary api eg, when the first is too loaded:
    ```typescript
    import { eventually } from "@codeo/eventually";
    const fallbackValue = 1;
    const result = await eventually(pollServer1, {
       redirect: (e: Error) => eventually(pollServer2, {
           redirect: (e: Error) => fallbackValue
       })
    });
    ```

