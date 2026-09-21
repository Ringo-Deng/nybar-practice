import type {staticTranslation} from './static-translation';

export function TranslationStatus({translation}:{translation:ReturnType<typeof staticTranslation>}){
 if(translation.missing)return <p className="translation-status translation-error" role="alert">{translation.message}</p>;
 return <p className="translation-caption">中文译文 · 机器翻译，请对照英文原文</p>;
}
