import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Film, Tv, CheckCircle, AlertTriangle, FileText, Clock, Radio, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();

  const statCards = [
    {
      title: "Total Channels",
      value: stats?.totalChannels ?? 0,
      sub: `${stats?.activeChannels ?? 0} active`,
      icon: Tv,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      action: () => setLocation("/channels"),
    },
    {
      title: "Total Videos",
      value: stats?.totalVideos ?? 0,
      sub: `${stats?.publishedVideos ?? 0} published`,
      icon: Film,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      action: () => setLocation("/videos"),
    },
    {
      title: "Published",
      value: stats?.publishedVideos ?? 0,
      sub: "Live in feeds",
      icon: CheckCircle,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      action: () => setLocation("/videos?status=published"),
    },
    {
      title: "Drafts",
      value: stats?.draftVideos ?? 0,
      sub: "Awaiting review",
      icon: FileText,
      color: "text-zinc-400",
      bg: "bg-zinc-500/10",
      action: () => setLocation("/videos?status=draft"),
    },
    {
      title: "Pending",
      value: stats?.pendingVideos ?? 0,
      sub: "Awaiting approval",
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      action: () => setLocation("/videos?status=pending"),
    },
    {
      title: "Validation Errors",
      value: stats?.validationErrors ?? 0,
      sub: "Need attention",
      icon: AlertTriangle,
      color: "text-red-400",
      bg: "bg-red-500/10",
      action: () => setLocation("/videos"),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RILAN Roku Content Platform — channel publishing overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium text-muted-foreground">RILAN GAMES LLC</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <Card
            key={card.title}
            className="bg-card border-border cursor-pointer hover:border-primary/40 transition-colors group"
            onClick={card.action}
          >
            <CardContent className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              {isLoading ? (
                <div className="h-7 w-12 bg-muted animate-pulse rounded mb-1" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">{card.title}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Manage Channels", path: "/channels", icon: Tv },
              { label: "Add New Video", path: "/videos", icon: Film },
              { label: "Preview Feeds", path: "/feed-preview", icon: Radio },
              { label: "Publishing Workflow", path: "/publishing", icon: CheckCircle },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => setLocation(action.path)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm text-foreground">{action.label}</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Feed Endpoints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              Public Roku Direct Publisher feed URLs for your active channels:
            </p>
            {[
              { slug: "shorts-tv", name: "RILAN Shorts TV" },
              { slug: "kids-tv", name: "RILAN Kids TV" },
              { slug: "food-tv", name: "RILAN Food TV" },
              { slug: "travel-tv", name: "RILAN Travel TV" },
            ].map((ch) => (
              <div key={ch.slug} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{ch.name}</span>
                <a
                  href={`/api/roku/feed/${ch.slug}.json`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline font-mono"
                >
                  /api/roku/feed/{ch.slug}.json
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
