import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Upload, RotateCw, Trash2, ArrowLeft, ArrowRight, X, ZoomIn, ImagePlus } from 'lucide-react';
import type { Photo, Problem } from '../shared/types';
import { kindNames } from '../shared/types';
export function Markdown({text}:{text:string}){
  const blocks=text.replace(/\$\$([\s\S]*?)\$\$/g,(_match,math:string)=>`\n\n$$\n${math.trim()}\n$$\n\n`);
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{blocks}</ReactMarkdown></div>;
}
export function Tags({p}:{p:Problem}){return <div className="tags"><span>{p.week}주차</span><span>{p.language}</span><span>{kindNames[p.kind]}</span><span className={'difficulty '+(p.difficulty==='도전'?'hard':'')}>{p.difficulty}</span></div>;}
export function Empty({title,description,action}:{title:string;description:string;action?:React.ReactNode}){return <div className="empty"><div className="empty-symbol">∅</div><h3>{title}</h3><p>{description}</p>{action}</div>;}
export async function preparePhoto(file:File):Promise<Photo>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG, PNG, WebP 사진을 사용하세요.');
  if(file.size>20*1024*1024)throw new Error('사진 한 장은 20MB 이하로 선택하세요.');
  const image=await createImageBitmap(file,{imageOrientation:'from-image'});
  const scale=Math.min(1,2000/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);image.close();
  return {id:crypto.randomUUID(),name:file.name,data:canvas.toDataURL('image/jpeg',.9),rotation:0};
}
export async function materializePhotos(photos:Photo[]):Promise<Photo[]>{
  return Promise.all(photos.map(async photo=>{
    if(!photo.rotation)return photo;
    const im=new Image();im.src=photo.data;await im.decode();const canvas=document.createElement('canvas');const swap=photo.rotation%180!==0;
    canvas.width=swap?im.height:im.width;canvas.height=swap?im.width:im.height;
    const c=canvas.getContext('2d')!;c.translate(canvas.width/2,canvas.height/2);c.rotate(photo.rotation*Math.PI/180);c.drawImage(im,-im.width/2,-im.height/2);
    return {...photo,data:canvas.toDataURL('image/jpeg',.9),rotation:0};
  }));
}
export function PhotoEditor({photos,onChange}:{photos:Photo[];onChange:(photos:Photo[])=>void}){
  const ref=useRef<HTMLInputElement>(null);const [error,setError]=useState('');const [zoom,setZoom]=useState<Photo|null>(null);const [busy,setBusy]=useState(false);
  async function add(files:FileList|null){if(!files)return;setBusy(true);setError('');try{if(photos.length+files.length>12)throw new Error('한 답안에 사진은 12장까지 첨부할 수 있습니다.');const incoming=await Promise.all(Array.from(files).map(preparePhoto));onChange([...photos,...incoming]);}catch(e){setError((e as Error).message);}finally{setBusy(false);if(ref.current)ref.current.value='';}}
  const move=(i:number,n:number)=>{const copy=[...photos];[copy[i],copy[n]]=[copy[n],copy[i]];onChange(copy);};
  return <div className="photo-editor"><input data-testid="photo-input" ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>void add(e.target.files)}/>
    <button className="upload-area" disabled={busy} onClick={()=>ref.current?.click()}><ImagePlus size={24}/><span><strong>{busy?'사진 준비 중…':'종이에 풀었나요? 풀이 사진을 올려주세요'}</strong><small>여러 장 첨부 · JPG, PNG, WebP · 최대 12장</small></span><Upload size={18}/></button>
    {error&&<p role="alert" className="error">{error}</p>}
    {!!photos.length&&<div className="photo-grid">{photos.map((p,i)=><div className="photo-card" key={p.id}><button className="photo-preview" aria-label={`${i+1}번 사진 확대`} onClick={()=>setZoom(p)}><img src={p.data} alt={`풀이 ${i+1}`} style={{transform:`rotate(${p.rotation}deg)`}}/><span><ZoomIn size={16}/></span></button><div className="photo-label">{i+1}. {p.name}</div><div className="photo-actions"><button aria-label={`${i+1}번 사진 왼쪽으로`} disabled={!i} onClick={()=>move(i,i-1)}><ArrowLeft size={15}/></button><button aria-label={`${i+1}번 사진 오른쪽으로`} disabled={i===photos.length-1} onClick={()=>move(i,i+1)}><ArrowRight size={15}/></button><button aria-label={`${i+1}번 사진 회전`} onClick={()=>onChange(photos.map(x=>x.id===p.id?{...x,rotation:(x.rotation+90)%360}:x))}><RotateCw size={15}/></button><button aria-label={`${i+1}번 사진 삭제`} onClick={()=>onChange(photos.filter(x=>x.id!==p.id))}><Trash2 size={15}/></button></div></div>)}</div>}
    {zoom&&<div className="modal-backdrop" onClick={()=>setZoom(null)}><div role="dialog" aria-modal="true" aria-label="풀이 사진 확대" className="photo-modal" onClick={e=>e.stopPropagation()}><button autoFocus className="close" aria-label="닫기" onClick={()=>setZoom(null)}><X/></button><img src={zoom.data} style={{transform:`rotate(${zoom.rotation}deg)`}} alt="확대한 풀이"/></div></div>}
  </div>;
}
