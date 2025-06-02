import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';

export function setupWebSocketServer(httpServer: any) {
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  const serverCleanup = useServer(
    {
      schema: {
        typeDefs,
        resolvers,
      },
      context: async (ctx, msg, args) => {
        // TODO: Implement WebSocket context creation
        return {};
      },
    },
    wsServer,
  );

  return { dispose: serverCleanup };
}
