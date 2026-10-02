import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthMe, logoutAuth, type AuthUser } from '@workspace/api-client-react';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  status: 'loading',
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AuthUser | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await getAuthMe();
      } catch (error) {
        // 401 simply means signed out; anything else is a real failure.
        if ((error as { status?: number }).status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const signOut = async () => {
    await logoutAuth();
    queryClient.setQueryData(['auth', 'me'], null);
    // Drop every user-scoped cache (conversations, stats, ...) so the next
    // sign-in starts fresh.
    queryClient.invalidateQueries();
  };

  const status: AuthStatus = isLoading ? 'loading' : data ? 'authenticated' : 'unauthenticated';

  return (
    <AuthContext.Provider value={{ user: data ?? null, status, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
