import type { BetterAuthPlugin } from 'better-auth'

export function firstUserAdmin(): BetterAuthPlugin {
  return {
    id: 'first-user-admin',
    init(ctx) {
      return {
        options: {
          databaseHooks: {
            user: {
              create: {
                after: async (user) => {
                  const count = await ctx.adapter.count({ model: 'user' })
                  if (count === 1) {
                    await ctx.adapter.update({
                      model: 'user',
                      where: [{ field: 'id', value: user.id }],
                      update: { role: 'admin' },
                    })
                  }
                },
              },
            },
          },
        },
      }
    },
  }
}
