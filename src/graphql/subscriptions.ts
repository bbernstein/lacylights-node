import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';

export function setupWebSocketServer(httpServer: any) {
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx, msg, args) => {
        const { createWebSocketContext } = await import('../context');
        return createWebSocketContext();
      },
    },
    wsServer,
  );

  return serverCleanup;
}
