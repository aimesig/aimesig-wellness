import { useEffect, useState, type ReactNode } from "react";
import { Check, Search, UserCheck, UserPlus, Users, X, Clock } from "lucide-react";
import {
  acceptFriendRequest, cancelFriendRequest, declineFriendRequest, getFriendRequestState,
  getFriendRequests, getFriends, getPublicProfile, searchPeople, sendFriendRequest,
  type Friend, type FriendRequest, type PublicProfile,
} from "../../services/socialService";

export function PeopleView({ userId }: { userId: string }) {
  const [term, setTerm] = useState(""); const [results, setResults] = useState<PublicProfile[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]); const [incoming, setIncoming] = useState<FriendRequest[]>([]); const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [states, setStates] = useState<Record<string,string>>({}); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [viewing, setViewing] = useState<PublicProfile | null>(null);
  async function refresh() {
    const [f, r] = await Promise.all([getFriends(userId), getFriendRequests(userId)]); setFriends(f); setIncoming(r.incoming); setOutgoing(r.outgoing);
    const ids = new Set([...results.map(x=>x.uid), ...r.incoming.map(x=>x.senderId), ...r.outgoing.map(x=>x.receiverId)]);
    const pairs = await Promise.all([...ids].map(async id => [id, await getFriendRequestState(userId,id)] as const)); setStates(Object.fromEntries(pairs));
  }
  useEffect(() => { void refresh().catch(e => setError(e?.message || "Unable to load people.")); }, [userId]);
  async function doSearch() { setError(""); if (!term.trim()) { setResults([]); return; } setLoading(true); try { const r=await searchPeople(term,userId); setResults(r); const pairs=await Promise.all(r.map(async p=>[p.uid,await getFriendRequestState(userId,p.uid)] as const)); setStates(s=>({...s,...Object.fromEntries(pairs)})); } catch(e:any){setError(e?.message||"Search failed.")} finally{setLoading(false);} }
  async function add(p: PublicProfile) { try { await sendFriendRequest(userId,p.uid); setStates(s=>({...s,[p.uid]:"pending"})); } catch(e:any){setError(e?.message||"Unable to send request.")} }
  async function act(fn:()=>Promise<void>) { try { await fn(); await refresh(); } catch(e:any){setError(e?.message||"Action failed.")} }
  return <div className="space-y-5">
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-pink-soft)] text-[var(--accent-pink)]"><Search size={18}/></div><div><h2 className="font-bold text-[var(--text-primary)]">Search People</h2><p className="text-xs text-[var(--text-secondary)]">Find people by @username or name.</p></div></div>
      <div className="flex gap-2"><input value={term} onChange={e=>setTerm(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void doSearch()}} placeholder="Search @username or name" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-pink)]"/><button onClick={()=>void doSearch()} className="rounded-xl bg-[var(--accent-pink)] px-4 text-sm font-semibold text-white">Search</button></div>
      {loading&&<p className="mt-3 text-xs text-[var(--text-secondary)]">Searching…</p>}{error&&<p className="mt-3 text-xs font-medium text-[var(--danger)]">{error}</p>}
      <div className="mt-4 space-y-2">{results.map(p=><PersonRow key={p.uid} person={p} state={states[p.uid]||"none"} onAdd={()=>void add(p)}/>)}</div>
      {!loading&&term.trim()&&!results.length&&<p className="mt-4 text-sm text-[var(--text-secondary)]">No people found.</p>}
    </section>
    {incoming.length>0&&<RequestSection title="Friend Requests" icon={<UserPlus size={17}/>} requests={incoming} incoming onAccept={r=>void act(()=>acceptFriendRequest(userId,r.senderId))} onDecline={r=>void act(()=>declineFriendRequest(userId,r.senderId))}/>} 
    {outgoing.length>0&&<RequestSection title="Sent Requests" icon={<Clock size={17}/>} requests={outgoing} onCancel={r=>void act(()=>cancelFriendRequest(userId,r.receiverId))}/>} 
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm"><Title icon={<Users size={17}/>} text="Friends" count={friends.length}/>{friends.length?<div className="mt-3 space-y-2">{friends.map(f=><div key={f.uid} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3"><Avatar name={f.displayName}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--text-primary)]">{f.displayName}</p><p className="truncate text-xs text-[var(--text-secondary)]">@{f.username}</p></div><button type="button" onClick={()=>setViewing(f)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">View Profile</button><span className="hidden sm:flex items-center gap-1 rounded-xl bg-[var(--success-soft)] px-3 py-2 text-xs font-semibold text-[var(--success)]"><UserCheck size={13}/> Friend</span></div>)}</div>:<div className="py-10 text-center text-sm text-[var(--text-secondary)]"><Users size={28} className="mx-auto mb-2 opacity-50"/>No friends yet.</div>}</section>
    {viewing && <PublicProfileCard person={viewing} onClose={()=>setViewing(null)} />}
  </div>;
}

function PublicProfileCard({ person, onClose }: { person: PublicProfile; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
    <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-xl" onMouseDown={e=>e.stopPropagation()}>
      <div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-xl p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"><X size={18}/></button></div>
      <div className="flex flex-col items-center text-center">
        <Avatar name={person.displayName}/><h3 className="mt-3 text-xl font-bold text-[var(--text-primary)]">{person.displayName}</h3><p className="text-sm text-[var(--accent-pink)]">@{person.username}</p>
        <p className="mt-4 text-xs text-[var(--text-secondary)]">This is their public AimeSig profile. Private health records, routines and documents are not shared.</p>
      </div>
    </div>
  </div>;
}
function Title({icon,text,count}:{icon:ReactNode;text:string;count:number}){return <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">{icon}{text}<span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px]">{count}</span></div>}
function Avatar({name}:{name:string}){return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-pink-soft)] font-bold text-[var(--accent-pink)]">{name.charAt(0).toUpperCase()}</div>}
function PersonRow({person,state,onAdd}:{person:PublicProfile;state:string;onAdd:()=>void}){return <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3"><Avatar name={person.displayName}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--text-primary)]">{person.displayName}</p><p className="truncate text-xs text-[var(--text-secondary)]">@{person.username}</p></div>{state==='pending'?<span className="rounded-xl bg-[var(--surface-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">Requested</span>:state==='accepted'?<span className="rounded-xl bg-[var(--success-soft)] px-3 py-2 text-xs font-semibold text-[var(--success)]">Friends</span>:state==='incoming'?<span className="rounded-xl bg-[var(--accent-pink-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-pink)]">Respond below</span>:<button onClick={onAdd} className="flex items-center gap-1 rounded-xl bg-[var(--accent-pink)] px-3 py-2 text-xs font-semibold text-white"><UserPlus size={13}/> Add Friend</button>}</div>}
function RequestSection({title,icon,requests,incoming,onAccept,onDecline,onCancel}:{title:string;icon:ReactNode;requests:FriendRequest[];incoming?:boolean;onAccept?:(r:FriendRequest)=>void;onDecline?:(r:FriendRequest)=>void;onCancel?:(r:FriendRequest)=>void}){return <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-sm"><Title icon={icon} text={title} count={requests.length}/><div className="mt-3 space-y-2">{requests.map(r=><RequestRow key={r.id} userId={incoming?r.senderId:r.receiverId} incoming={incoming} onAccept={()=>onAccept?.(r)} onDecline={()=>onDecline?.(r)} onCancel={()=>onCancel?.(r)}/>)}</div></section>}
function RequestRow({userId,incoming,onAccept,onDecline,onCancel}:{userId:string;incoming?:boolean;onAccept?:()=>void;onDecline?:()=>void;onCancel?:()=>void}){const [p,setP]=useState<PublicProfile|null>(null);useEffect(()=>{void getPublicProfile(userId).then(setP).catch(()=>{})},[userId]);if(!p)return null;return <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3"><Avatar name={p.displayName}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--text-primary)]">{p.displayName}</p><p className="truncate text-xs text-[var(--text-secondary)]">@{p.username}</p></div>{incoming?<div className="flex gap-1.5"><button onClick={onAccept} className="rounded-xl bg-[var(--success)] px-3 py-2 text-xs font-semibold text-white"><Check size={13} className="inline mr-1"/>Accept</button><button onClick={onDecline} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"><X size={13} className="inline mr-1"/>Decline</button></div>:<button onClick={onCancel} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">Cancel</button>}</div>}
