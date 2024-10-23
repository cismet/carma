import {
    useContext,
    useRef,
    useEffect,
} from 'react';
import { FolderApi } from 'tweakpane';
import { TweakpaneContext } from '../TweakpaneContext';

interface Input {
    label?: string;
    name: string;
    [key: string]: unknown;
}

interface FolderConfig {
    title: string;
    expanded?: boolean;
}


export const useTweakpaneCtx = (
    folderConfig: FolderConfig,
    params: { [key: string]: unknown },
    inputs: Input[]
) => {
    const context = useContext(TweakpaneContext);
    const folderRef = useRef<FolderApi | null>(null);

    if (!context) {
        throw new Error('useTweakpane must be used within a TweakpaneProvider');
    }

    const pane = context.paneRef.current;

    useEffect(() => {
        if (!pane) return;
        folderRef.current = pane.addFolder(folderConfig);
        inputs.forEach((input) => {
            folderRef.current &&
                folderRef.current.addBinding(params, input.name, input);
        });

        return () => {
            folderRef.current && folderRef.current.dispose();
            folderRef.current = null;
        };
    }, [folderConfig, params, inputs, pane]);

    const folderCallback = (fn: (folder: FolderApi) => void) => {
        if (folderRef.current) {
            fn(folderRef.current);
        } else {
            console.warn('Folder not initialized yet');
        }
    };

    return { folderRef, folderCallback };
};