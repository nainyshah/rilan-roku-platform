import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ReconnectToast } from "./components/ReconnectToast";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useHealthPolling } from "./hooks/useHealthPolling";
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

function Router() {
  return (
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
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

/** Mounts health-polling and reconnect toast — must be inside QueryClientProvider */
function AppInner() {
  useHealthPolling();
  return (
    <>
      <Router />
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
