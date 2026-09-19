import {Loader2,RotateCcw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {useTranslation} from './use-translation';

export function TranslationStatus({translation}:{translation:ReturnType<typeof useTranslation>}){
 if(translation.status==='loading')return <div className="translation-status" role="status"><Loader2 size={14} className="animate-spin"/><span>{translation.message}</span></div>;
 if(translation.status==='error')return <div className="translation-status translation-error" role="alert"><span>{translation.message}</span><Button variant="ghost" size="sm" onClick={()=>void translation.load()}><RotateCcw size={14}/>重试翻译</Button></div>;
 if(translation.status==='ready'&&translation.needsTranslation)return <p className="translation-caption">中文译文 · 机器翻译</p>;
 return null;
}
