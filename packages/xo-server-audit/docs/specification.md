This is a specification document which stipulate how the Audit log plugin should work.

### Function

Audit log is a plugin which add to XO the ability to keep a trace of the API calls.

### Log construction

To construct the logs, the plugin should handle two events:

- `xo:preCall`: emitted before the call of the method
- `xo:postCall`: emitted after the call of the method

Each events provide data:

```
pre call data:

preCallData {
  callId: String,
  method: String,
  params: Object,
  timestamp: Number,
  userId: String,
  userName: String,
}

post call data:

postCallData {
  ...preCallData,
  duration: Number,
  error?: object,
  result?: Any,
  timestamp: Number,
}
```

These data should be consolidated as a hashed chains to be able to check the integrity of the stored logs. Each log entry is identified by its hash and contains the parent hash.

```
Log structure:

[Hash] {
  callId: String,
  duration?: Number,
  end?: Number,
  error?: object,
  method: String,
  params: Object,
  preHash: Hash,
  result?: Any,
  start: Number,
  userId: String,
  userName: String,
}
```

### Block list

Some API calls should be skipped because they don't have any side effect on the infrastructure and we can't make any conclusion on analyzing them like the listing calls.

To skip this API calls, Audit log should provide a `Block list` containing methods which will not be stored.

This `Block list` can be a file in the plugin folder named `.blockList` which contains API methods listed using the [micromatch](https://github.com/micromatch/micromatch) pattern.


### Check the integrity of the logs

#### Manual checking

The plugin should be able to check the integrity of the previous logs starting from a hash provided by the user.

#### Automatic checking

The plugin should communicate with www-xo to store n latest hashes and automatically check the integrity of the logs for each n seconds.

The number of the sent hashes and the check delay should be configurable.

### GC

The plugin should provide two ways to clean stored logs, one automatic/configurable and the second manual.
