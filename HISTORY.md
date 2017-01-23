## 1.4.0 (January 23, 2017)

- Consider promise rejection as an exception (#15)
- Fixed issue with aggressive test suite re-run on any file update from basis.js dev-server

## 1.3.0 (October 8, 2016)

- Implemented test environment destroy when test is done and file syncing is switched off (#10, @wuzyk)
- Fixed issue with nested `assert.async()` fails on low CPU (#13, @wuzyk)

## 1.2.3 (July 16, 2016)

- Fixed `assert.visited()` wrong failure for first test in just inited scope

## 1.2.2 (July 16, 2016)

- Fixed issue with using as `node.js` module

## 1.2.1 (July 15, 2016)

- Fix issue with `assert.async()` called in next code frame, e.g. via `setTimeout()` (#7)

## 1.2.0 (July 13, 2016)

- Support for `Promise` as result of test function (#6)
- Rework timers and fix issue with race condition when using `setImmediate` polyfill (#3)
- Implement `visit` API
- Rework build and publish

## 1.1.0 (July 1, 2016)

- Add stack trace for exception
- Fix test group selection

## 1.0.3 (December 25, 2015)

- Fix readme in release

## 1.0.2 (December 25, 2015)

- Make `assert.async()` work (thanks to @wuzyk)

## 1.0.0 (May 13, 2015)

- Initial release
