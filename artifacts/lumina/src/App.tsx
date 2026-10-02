import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme-provider';
import { AuthProvider } from '@/lib/auth-provider';
import AuthGate from '@/components/auth-gate';
import GuestOnly from '@/components/guest-only';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import SignIn from '@/pages/sign-in';
import SignUp from '@/pages/sign-up';
import ChatHome from '@/pages/chat-home';
import ChatConversation from '@/pages/chat-conversation';
import Pricing from '@/pages/pricing';
import CompareHub from '@/pages/compare-hub';
import ComparisonPage from '@/pages/comparison';
import { Route, Switch, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/sign-in">
        <GuestOnly>
          <SignIn />
        </GuestOnly>
      </Route>
      <Route path="/sign-up">
        <GuestOnly>
          <SignUp />
        </GuestOnly>
      </Route>
      <Route path="/chat">
        <AuthGate>
          <ChatHome />
        </AuthGate>
      </Route>
      <Route path="/chat/:id">
        <AuthGate>
          <ChatConversation />
        </AuthGate>
      </Route>
      <Route path="/pricing" component={Pricing} />
      <Route path="/compare" component={CompareHub} />
      <Route path="/compare/:slug" component={ComparisonPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
