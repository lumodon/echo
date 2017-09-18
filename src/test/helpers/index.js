module.exports = Object.assign({},
  require('./db'),
  require('./graphql'),
  {useFixture: require('./fixtures')},
  require('./expectations'),
  require('./idmMocks'),
)
