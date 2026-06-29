import { useState, useRef, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Play, 
  Square, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Zap,
  Clock,
  Globe,
  Terminal,
  Server
} from "lucide-react";

import { 
  useStartSession, 
  useGetSessionStatus, 
  useStopSession, 
  getGetSessionStatusQueryKey,
  SessionInputMode,
  SessionStatusState
} from "@workspace/api-client-react";

import { sessionFormSchema, type SessionFormValues } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AnimatedNumber } from "@/components/animated-number";
import { MobileBanner } from "@/components/mobile-banner";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { toast } = useToast();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      token: "",
      url: "",
      count: 20,
      delay: 1.0,
      mode: "direct",
    },
  });

  const startSession = useStartSession();
  const stopSession = useStopSession();

  // Status polling logic
  const { data: sessionStatus } = useGetSessionStatus(
    activeSessionId || "",
    {
      query: {
        enabled: !!activeSessionId,
        queryKey: getGetSessionStatusQueryKey(activeSessionId || ""),
        refetchInterval: (query) => {
          const state = query.state?.data?.state;
          if (state === "running" || state === "pending") return 1500;
          return false;
        }
      }
    }
  );

  const isRunning = sessionStatus?.state === "running" || sessionStatus?.state === "pending" || startSession.isPending;
  const isDone = sessionStatus?.state === "done" || sessionStatus?.state === "stopped" || sessionStatus?.state === "error";

  const onSubmit = async (values: SessionFormValues) => {
    if (isRunning) return;

    try {
      const response = await startSession.mutateAsync({
        data: {
          token: values.token,
          url: values.url,
          count: values.count,
          delay: values.delay,
          mode: values.mode as SessionInputMode,
        }
      });
      
      setActiveSessionId(response.sessionId);
      toast({
        title: "Session Started",
        description: "Connecting to rotating proxies...",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to start",
        description: error.message || "An unexpected error occurred",
      });
    }
  };

  const handleStop = async () => {
    if (!activeSessionId) return;
    
    try {
      await stopSession.mutateAsync({ sessionId: activeSessionId });
      toast({
        title: "Session Stopped",
        description: "Traffic generation halted.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to stop",
        description: error.message || "Could not stop the session",
      });
    }
  };

  // Memoize visible logs to prevent excessive re-renders during rapid polling
  const visibleLogs = useMemo(() => {
    if (!sessionStatus?.logs) return [];
    return [...sessionStatus.logs]
      .sort((a, b) => b.index - a.index)
      .slice(0, 50);
  }, [sessionStatus?.logs]);

  const successRate = sessionStatus?.completed 
    ? Math.round((sessionStatus.success / sessionStatus.completed) * 100) 
    : 0;

  const progressValue = sessionStatus?.total 
    ? (sessionStatus.completed / sessionStatus.total) * 100 
    : 0;

  const getStatusBadge = (state?: string) => {
    switch (state) {
      case "running": return <Badge variant="glowCyan" className="animate-pulse">RUNNING</Badge>;
      case "pending": return <Badge variant="outline" className="text-primary border-primary">PENDING</Badge>;
      case "done": return <Badge variant="success">DONE</Badge>;
      case "stopped": return <Badge variant="secondary">STOPPED</Badge>;
      case "error": return <Badge variant="fail">ERROR</Badge>;
      default: return null;
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center bg-background text-foreground pb-20 relative overflow-x-hidden selection:bg-primary/30">
      
      {/* Background ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none -z-10 opacity-50 mix-blend-screen" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none -z-10 opacity-30 mix-blend-screen" />

      {/* Grid texture */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

      <main className="w-full max-w-4xl px-4 py-8 md:py-12 flex flex-col gap-8 md:gap-12 z-10">
        
        {/* Header / Hero */}
        <header className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-3">
            <Zap className="w-8 h-8 md:w-10 md:h-10 text-primary drop-shadow-[0_0_15px_rgba(0,229,255,0.8)]" />
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-white to-accent drop-shadow-[0_0_20px_rgba(0,229,255,0.3)]">
              AutoVisitor Premium
            </h1>
          </div>
          <p className="text-muted-foreground max-w-lg md:text-lg font-mono text-sm">
            Boost your traffic with rotating proxies.
          </p>
        </header>

        {/* Control Panel */}
        <Card className="border-primary/20 shadow-[0_8px_30px_-12px_rgba(0,229,255,0.15)] relative overflow-hidden backdrop-blur-sm">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
          
          <CardHeader className="border-b border-border/50 bg-secondary/30 pb-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg font-mono tracking-wide">Mission Control</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <FormField
                    control={form.control}
                    name="token"
                    render={({ field }) => (
                      <FormItem className="col-span-1 md:col-span-2">
                        <FormLabel className="font-mono text-primary/80">Webshare API Token</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="wshr_..." 
                            {...field} 
                            disabled={isRunning}
                            className="font-mono focus-visible:ring-primary focus-visible:border-primary shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="url"
                    render={({ field }) => (
                      <FormItem className="col-span-1 md:col-span-2">
                        <FormLabel className="font-mono text-primary/80 flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5" /> Target URL
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://your-site.com/..." 
                            {...field} 
                            disabled={isRunning}
                            className="font-mono focus-visible:ring-primary focus-visible:border-primary shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="count"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-primary/80 flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5" /> Visit Count
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min={1} 
                            max={1000} 
                            {...field} 
                            disabled={isRunning}
                            className="font-mono focus-visible:ring-primary focus-visible:border-primary shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="delay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-primary/80 flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5" /> Delay (seconds)
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.1" 
                            min={0} 
                            {...field} 
                            disabled={isRunning}
                            className="font-mono focus-visible:ring-primary focus-visible:border-primary shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mode"
                    render={({ field }) => (
                      <FormItem className="col-span-1 md:col-span-2">
                        <FormLabel className="font-mono text-primary/80 flex items-center gap-2">
                          <Server className="w-3.5 h-3.5" /> Proxy Mode
                        </FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                          disabled={isRunning}
                        >
                          <FormControl>
                            <SelectTrigger className="font-mono focus:ring-primary shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                              <SelectValue placeholder="Select mode" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="direct" className="font-mono">direct (Standard)</SelectItem>
                            <SelectItem value="backbone" className="font-mono">backbone (High Performance)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="pt-4">
                  {isRunning ? (
                    <Button 
                      type="button" 
                      onClick={handleStop}
                      variant="neonDestructive" 
                      size="xl" 
                      className="w-full flex items-center gap-3 text-lg tracking-wider"
                    >
                      <Square className="fill-current w-5 h-5" /> STOP SESSION
                    </Button>
                  ) : (
                    <Button 
                      type="submit" 
                      variant="neon" 
                      size="xl" 
                      className="w-full flex items-center gap-3 text-lg tracking-wider"
                      disabled={startSession.isPending}
                    >
                      <Play className="fill-current w-5 h-5" /> 
                      {startSession.isPending ? "INITIALIZING..." : "START SESSION"}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Live Stats */}
        <AnimatePresence mode="popLayout">
          {(isRunning || isDone || activeSessionId) && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-mono text-white/90 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" /> Session Status
                  </h2>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(sessionStatus?.state)}
                    {sessionStatus?.errorMessage && (
                      <span className="text-sm text-destructive font-mono truncate max-w-[200px] md:max-w-md">
                        {sessionStatus.errorMessage}
                      </span>
                    )}
                  </div>
                </div>
                
                {sessionStatus && (
                  <div className="text-right flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono">Success Rate</span>
                      <span className="text-2xl font-mono text-primary drop-shadow-[0_0_10px_rgba(0,229,255,0.5)]">
                        <AnimatedNumber value={successRate} />%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {sessionStatus && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono text-muted-foreground">
                    <span>Progress</span>
                    <span>{sessionStatus.completed} / {sessionStatus.total}</span>
                  </div>
                  <Progress value={progressValue} className="h-2" />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-secondary/40 border-border backdrop-blur-sm">
                  <CardContent className="p-4 md:p-6 flex flex-col items-center justify-center text-center gap-1">
                    <span className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Total Visits</span>
                    <span className="text-4xl font-mono text-white">
                      <AnimatedNumber value={sessionStatus?.completed || 0} />
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/40 border-success/30 shadow-[0_0_15px_rgba(0,255,136,0.05)] backdrop-blur-sm">
                  <CardContent className="p-4 md:p-6 flex flex-col items-center justify-center text-center gap-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span className="text-sm text-success/80 font-mono uppercase tracking-widest">Success</span>
                    </div>
                    <span className="text-4xl font-mono text-success drop-shadow-[0_0_10px_rgba(0,255,136,0.3)]">
                      <AnimatedNumber value={sessionStatus?.success || 0} />
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/40 border-destructive/30 shadow-[0_0_15px_rgba(255,68,68,0.05)] backdrop-blur-sm">
                  <CardContent className="p-4 md:p-6 flex flex-col items-center justify-center text-center gap-1">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-destructive" />
                      <span className="text-sm text-destructive/80 font-mono uppercase tracking-widest">Failed</span>
                    </div>
                    <span className="text-4xl font-mono text-destructive drop-shadow-[0_0_10px_rgba(255,68,68,0.3)]">
                      <AnimatedNumber value={sessionStatus?.failed || 0} />
                    </span>
                  </CardContent>
                </Card>
              </div>

              {/* Visit Log */}
              {visibleLogs.length > 0 && (
                <Card className="border-border/50 bg-secondary/20 backdrop-blur-md overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-border/50 bg-black/20 flex justify-between items-center">
                    <h3 className="font-mono text-sm tracking-widest text-muted-foreground uppercase flex items-center gap-2">
                      <Terminal className="w-4 h-4" /> Output Log
                    </h3>
                    <span className="text-xs font-mono text-muted-foreground/50">Last 50 visits</span>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="min-w-[600px] w-full">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/50 hover:bg-transparent">
                            <TableHead className="w-16 font-mono text-xs uppercase text-muted-foreground/70">#</TableHead>
                            <TableHead className="font-mono text-xs uppercase text-muted-foreground/70">Proxy IP</TableHead>
                            <TableHead className="w-24 font-mono text-xs uppercase text-muted-foreground/70 text-center">Result</TableHead>
                            <TableHead className="w-24 font-mono text-xs uppercase text-muted-foreground/70 text-right">Status</TableHead>
                            <TableHead className="w-28 font-mono text-xs uppercase text-muted-foreground/70 text-right">Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <AnimatePresence initial={false}>
                            {visibleLogs.map((log) => (
                              <motion.tr 
                                key={`${log.index}-${log.timestamp}`}
                                initial={{ opacity: 0, backgroundColor: log.success ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)' }}
                                animate={{ opacity: 1, backgroundColor: 'transparent' }}
                                transition={{ duration: 0.5 }}
                                className="border-border/20 group hover:bg-white/[0.02]"
                              >
                                <TableCell className="font-mono text-xs text-muted-foreground/50">{log.index}</TableCell>
                                <TableCell className="font-mono text-sm tracking-tight text-white/80">{log.proxy}</TableCell>
                                <TableCell className="text-center">
                                  {log.success ? (
                                    <Badge variant="success" className="text-[10px] font-mono rounded-sm py-0 h-5">OK</Badge>
                                  ) : (
                                    <Badge variant="fail" className="text-[10px] font-mono rounded-sm py-0 h-5">FAIL</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-right">
                                  {log.statusCode ? (
                                    <span className={log.statusCode >= 200 && log.statusCode < 300 ? "text-success/80" : "text-destructive/80"}>
                                      {log.statusCode}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/30">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-[10px] text-muted-foreground/50 text-right">
                                  {new Date(log.timestamp).toLocaleTimeString(undefined, { 
                                    hour12: false, 
                                    hour: '2-digit', 
                                    minute: '2-digit', 
                                    second: '2-digit',
                                    fractionalSecondDigits: 3
                                  })}
                                </TableCell>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <MobileBanner />
    </div>
  );
}
