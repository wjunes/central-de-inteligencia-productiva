import { config } from './config.js';
import { createStaticServer } from './static-server.js';

const server = createStaticServer();
server.listen(config.port, () => {
  console.log(`[web] CIP frontend sirviendo en :${config.port} (env=${config.nodeEnv}, api=${config.apiBaseUrl})`);
});
