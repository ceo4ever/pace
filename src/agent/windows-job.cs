using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class PaceWindowsJob {
  [StructLayout(LayoutKind.Sequential)] struct FILETIME { public uint Low, High; public ulong Value { get { return ((ulong)High << 32) | Low; } } }
  [StructLayout(LayoutKind.Sequential)] struct BASIC_PROCESS { public IntPtr Reserved1, Peb, Reserved2a, Reserved2b, Pid, ParentPid; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string reserved, desktop, title; public uint x,y,xs,ys,xc,yc,fill,flags; public short show, reserved2; public IntPtr reservedPtr, stdin, stdout, stderr; }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO startup; public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process, thread; public uint pid, tid; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long processTime, jobTime; public uint flags; public UIntPtr minWorking, maxWorking; public uint active; public UIntPtr affinity; public uint priority, scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong readOps, writeOps, otherOps, readBytes, writeBytes, otherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT basic; public IO_COUNTERS io; public UIntPtr processMemory, jobMemory, peakProcess, peakJob; }
  [StructLayout(LayoutKind.Sequential)] struct ACCOUNTING { public long user, kernel, periodUser, periodKernel; public uint faults, total, active, terminated; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr attrs, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref EXTENDED_LIMIT info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int cls, ref ACCOUNTING info, uint size, IntPtr returned);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out FILETIME created, out FILETIME exit, out FILETIME kernel, out FILETIME user);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int cls, ref BASIC_PROCESS info, int size, IntPtr returned);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr GetStdHandle(int index);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool DuplicateHandle(IntPtr source, IntPtr handle, IntPtr dest, out IntPtr copy, uint access, bool inherit, uint options);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string app, StringBuilder command, IntPtr procAttrs, IntPtr threadAttrs, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX startup, out PROCESS_INFORMATION info);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Check(bool ok, string action) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), action); }
  static IntPtr CopyStd(int which) { IntPtr copy; IntPtr current=GetCurrentProcess(); Check(DuplicateHandle(current,GetStdHandle(which),current,out copy,0,true,2),"standard handle duplication failed"); return copy; }
  static string Quote(string arg) {
    if (arg.Length>0 && arg.IndexOfAny(new char[]{' ','\t','\n','\v','"'})<0) return arg;
    StringBuilder b=new StringBuilder("\""); int slashes=0;
    foreach(char c in arg) { if(c=='\\') { slashes++; continue; } if(c=='"') { b.Append('\\',slashes*2+1); b.Append('"'); } else { b.Append('\\',slashes); b.Append(c); } slashes=0; }
    b.Append('\\',slashes*2); b.Append('"'); return b.ToString();
  }
  static bool Empty(IntPtr job) { ACCOUNTING a=new ACCOUNTING(); Check(QueryInformationJobObject(job,1,ref a,(uint)Marshal.SizeOf(typeof(ACCOUNTING)),IntPtr.Zero),"job query failed"); return a.active==0; }
  public static bool ValidParent(int claimedParent, int observedParent, int claimedSupervisor, int observedSupervisor, ulong parentCreated, ulong supervisorCreated, ulong watcherCreated) {
    // Equal creation times cannot distinguish a reused PID; refuse the ambiguous case.
    return claimedParent==observedParent && claimedSupervisor==observedSupervisor && parentCreated<supervisorCreated && supervisorCreated<watcherCreated;
  }
  public static int Run(StreamReader reader, StreamWriter writer, int parentPid, int supervisorPid, string exe, string[] args, string cwd, IDictionary<string,string> env, long deadline) {
    IntPtr parent=IntPtr.Zero,supervisor=IntPtr.Zero,job=IntPtr.Zero,list=IntPtr.Zero,jobValue=IntPtr.Zero,handlesValue=IntPtr.Zero,envPtr=IntPtr.Zero;
    IntPtr[] std=new IntPtr[3]; PROCESS_INFORMATION child=new PROCESS_INFORMATION(); bool listReady=false, started=false;
    try {
      BASIC_PROCESS b=new BASIC_PROCESS(); Check(NtQueryInformationProcess(GetCurrentProcess(),0,ref b,Marshal.SizeOf(typeof(BASIC_PROCESS)),IntPtr.Zero)==0,"parent identity failed");
      supervisor=OpenProcess(0x00101000,false,(int)b.ParentPid.ToInt64()); Check(supervisor!=IntPtr.Zero,"supervisor handle failed");
      BASIC_PROCESS sb=new BASIC_PROCESS(); Check(NtQueryInformationProcess(supervisor,0,ref sb,Marshal.SizeOf(typeof(BASIC_PROCESS)),IntPtr.Zero)==0,"supervisor identity failed");
      parent=OpenProcess(0x00101000,false,parentPid); Check(parent!=IntPtr.Zero,"parent handle failed");
      FILETIME pc,pe,pk,pu,sc,se,sk,su,ic,ie,ik,iu; Check(GetProcessTimes(parent,out pc,out pe,out pk,out pu),"parent creation time failed"); Check(GetProcessTimes(supervisor,out ic,out ie,out ik,out iu),"supervisor creation time failed"); Check(GetProcessTimes(GetCurrentProcess(),out sc,out se,out sk,out su),"watcher creation time failed");
      if(!ValidParent(parentPid,(int)sb.ParentPid.ToInt64(),supervisorPid,(int)b.ParentPid.ToInt64(),pc.Value,ic.Value,sc.Value) || WaitForSingleObject(parent,0)!=258 || WaitForSingleObject(supervisor,0)!=258) throw new InvalidOperationException("parent identity or lifetime mismatch");
      job=CreateJobObjectW(IntPtr.Zero,null); Check(job!=IntPtr.Zero,"job creation failed"); EXTENDED_LIMIT limit=new EXTENDED_LIMIT(); limit.basic.flags=0x2000; Check(SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(typeof(EXTENDED_LIMIT))),"job setting failed");
      std[0]=CopyStd(-10); std[1]=CopyStd(-11); std[2]=CopyStd(-12);
      IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref size); list=Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(list,2,0,ref size),"attribute init failed"); listReady=true;
      jobValue=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobValue,job);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000d),jobValue,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero),"job assignment attribute failed");
      handlesValue=Marshal.AllocHGlobal(IntPtr.Size*3); Marshal.Copy(std,0,handlesValue,3);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handlesValue,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero),"handle list failed");
      List<string> keys=new List<string>(env.Keys); keys.Sort(StringComparer.OrdinalIgnoreCase); StringBuilder block=new StringBuilder();
      foreach(string key in keys) { if(key.IndexOf('=')>=0 || key.IndexOf('\0')>=0 || env[key].IndexOf('\0')>=0) throw new InvalidOperationException("invalid environment"); block.Append(key).Append('=').Append(env[key]).Append('\0'); } block.Append('\0');
      envPtr=Marshal.StringToHGlobalUni(block.ToString());
      STARTUPINFOEX si=new STARTUPINFOEX(); si.startup.cb=Marshal.SizeOf(typeof(STARTUPINFOEX)); si.startup.flags=0x101; si.startup.show=0; si.startup.stdin=std[0]; si.startup.stdout=std[1]; si.startup.stderr=std[2]; si.attributes=list;
      StringBuilder cmd=new StringBuilder(Quote(exe)); foreach(string arg in args) cmd.Append(' ').Append(Quote(arg));
      Check(CreateProcessW(exe,cmd,IntPtr.Zero,IntPtr.Zero,true,0x08080404,envPtr,cwd,ref si,out child),"agent creation or job assignment failed");
      writer.WriteLine("READY");
      if(reader.ReadLine()!="START" || WaitForSingleObject(parent,0)!=258) throw new InvalidOperationException("parent handshake failed");
      Check(ResumeThread(child.thread)!=0xffffffff,"agent resume failed"); started=true;
      Stopwatch elapsed=Stopwatch.StartNew();
      Task<string> control=Task.Run(() => reader.ReadLine()); bool parentGone=false; bool stop=false;
      while(true) {
        if(WaitForSingleObject(parent,0)!=258) { parentGone=true; break; }
        if(WaitForSingleObject(child.process,0)==0) break;
        if(control.IsCompleted) { string line=control.Result; if(line==null || line=="STOP") { stop=true; break; } control=Task.Run(() => reader.ReadLine()); }
        if(elapsed.ElapsedMilliseconds>deadline) { stop=true; break; }
        Thread.Sleep(25);
      }
      uint code=1; if(!stop && !parentGone) Check(GetExitCodeProcess(child.process,out code),"exit status failed");
      Check(TerminateJobObject(job,1),"job termination failed");
      Stopwatch reapTime=Stopwatch.StartNew(); while(!Empty(job) && reapTime.ElapsedMilliseconds<3000) Thread.Sleep(20);
      bool reaped=Empty(job); if(!parentGone) writer.WriteLine("DONE:"+code+":"+(reaped?"1":"0"));
      return unchecked((int)code);
    } finally {
      if(job!=IntPtr.Zero) { if(started || child.process!=IntPtr.Zero) TerminateJobObject(job,1); CloseHandle(job); }
      if(child.thread!=IntPtr.Zero) CloseHandle(child.thread); if(child.process!=IntPtr.Zero) CloseHandle(child.process);
      if(parent!=IntPtr.Zero) CloseHandle(parent); if(supervisor!=IntPtr.Zero) CloseHandle(supervisor); foreach(IntPtr h in std) if(h!=IntPtr.Zero) CloseHandle(h);
      if(listReady) DeleteProcThreadAttributeList(list); if(list!=IntPtr.Zero) Marshal.FreeHGlobal(list);
      if(jobValue!=IntPtr.Zero) Marshal.FreeHGlobal(jobValue); if(handlesValue!=IntPtr.Zero) Marshal.FreeHGlobal(handlesValue); if(envPtr!=IntPtr.Zero) Marshal.FreeHGlobal(envPtr);
    }
  }
}
