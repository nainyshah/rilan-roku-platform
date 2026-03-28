import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ReconnectToast } from "./components/ReconnectToast";
import { PasswordExpiryBanner } from "./components/PasswordExpiryBanner";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useHealthPolling } from "./hooks/useHealthPolling";
import { useRecoveryNotification } from "./hooks/useRecoveryNotification";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
import { useEffect } from "react";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Channels from "./pages/Channels";
import ChannelDetail from "./pages/ChannelDetail";
import Videos from "./pages/Videos";
import VideoDetail from "./pages/VideoDetail";
import Categories from "./pages/Categories";
import Branding from "./pages/Branding";
import FeedPreview from "./pages/FeedPreview";
import Publishing from "./pages/Publishing";
import ImportVideos from "./pages/ImportVideos";
import ImportHistory from "./pages/ImportHistory";
import Webhooks from "./pages/Webhooks";
import AIPage from "./pages/AI";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import SetupTotp from "./pages/SetupTotp";
import UserManagement from "./pages/UserManagement";

/** Magic-link callback handler — verifies token and redirects */
function MagicLinkCallback() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const utils = trpc.useUtils();

  const email = params.get("email");

  const verify = trpc.auth.verifyMagicLink.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/");
    },
    onError: () => navigate("/login?error=magic_link_invalid"),
  });

  useEffect(() => {
    if (token && email) verify.mutate({ token, email });
    else navigate("/login");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}

/** Protected route wrapper — redirects to /login if not authenticated, and to /change-password if mustChangePassword is set */
function ProtectedRouter() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [location, navigate] = useLocation();

  // Force password change before accessing any other page
  useEffect(() => {
    if (
      user &&
      (user as any).mustChangePassword &&
      location !== "/change-password"
    ) {
      navigate("/change-password");
    }
  }, [user, location, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null; // redirect in progress

  return (
    <>
      <PasswordExpiryBanner />
      <DashboardLayout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/channels" component={Channels} />
          <Route path="/channels/:id" component={ChannelDetail} />
          <Route path="/videos" component={Videos} />
          <Route path="/videos/:id" component={VideoDetail} />
          <Route path="/categories" component={Categories} />
          <Route path="/branding" component={Branding} />
          <Route path="/feed-preview" component={FeedPreview} />
          <Route path="/publishing" component={Publishing} />
          <Route path="/import" component={ImportVideos} />
          <Route path="/import/history" component={ImportHistory} />
          <Route path="/webhooks" component={Webhooks} />
          <Route path="/ai" component={AIPage} />
          <Route path="/settings" component={Settings} />
          <Route path="/change-password" component={ChangePassword} />
          <Route path="/setup-2fa" component={SetupTotp} />
          <Route path="/users" component={UserManagement} />
          <Route component={NotFound} />
        </Switch>
      </DashboardLayout>
    </>
  );
}

/** Mounts health-polling, reconnect toast, and recovery notifications — must be inside QueryClientProvider */
function AppInner() {
  useHealthPolling();
  useRecoveryNotification();
  return (
    <>
      <Switch>
        {/* Public routes */}
        <Route path="/login" component={Login} />
        <Route path="/auth/magic" component={MagicLinkCallback} />
        {/* All other routes are protected */}
        <Route component={ProtectedRouter} />
      </Switch>
      <ReconnectToast />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <AppInner />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
