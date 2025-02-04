# xo-server-transport-icinga2 [![Build Status](https://travis-ci.org/vatesfr/xen-orchestra.png?branch=master)](https://travis-ci.org/vatesfr/xen-orchestra)

> xo-server plugin to send status to icinga2 server

## Install

For installing XO and the plugins from the sources, please take a look at [the documentation](https://xen-orchestra.com/docs/from_the_sources.html).

## Usage

Like all other xo-server plugins, it can be configured directly via
the web interface, see [the plugin documentation](https://xen-orchestra.com/docs/plugins.html).

## Development

### `Xo#sendIcinga2Status({ status, message })`

This xo method is called to send a passive check to icinga2 and change the status of a service.
It has two parameters:
- status: it's the service status in icinga2 (0: OK | 1: WARNING | 2: CRITICAL | 3: UNKNOWN).
- message: it's the status information in icinga2.

```
# Install dependencies
> npm install

# Run the tests
> npm test

# Continuously compile
> npm run dev

# Continuously run the tests
> npm run dev-test

# Build for production (automatically called by npm install)
> npm run build
```

## Contributions

Contributions are *very* welcomed, either on the documentation or on
the code.

You may:

- report any [issue](https://github.com/vatesfr/xen-orchestra/issues)
  you've encountered;
- fork and create a pull request.

## License

AGPL3 © [Vates SAS](https://vates.fr)
