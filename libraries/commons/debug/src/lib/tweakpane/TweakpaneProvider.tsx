import React, {
    useRef,
    useEffect,
    useState,
} from 'react';
import type { ReactNode } from 'react';
import { Pane } from 'tweakpane';
import localForage from 'localforage';
import { hasHashParam, removeHashParam } from '../utils';
import { TweakpaneContext } from './TweakpaneContext';

const eventKeys = ['~', 'F12']; //
const localForageKey = 'tweakpaneEnabled';

export const TweakpaneProvider: React.FC<{
    children: ReactNode;
    hashparam?: string;
    position?: {
        top?: number,
        left?: number,
        right?: number,
    }
}> = ({ children, hashparam = 'dev', position = { top: 64, left: 64 } }) => {
    const [isEnabled, setIsEnabled] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const paneRef = useRef<Pane | null>(null);

    const disableTweakpane = () => {
        setIsEnabled(false);
        localForage.removeItem(localForageKey);
        removeHashParam(hashparam);
    };

    useEffect(() => {
        const checkHashAndStoredState = async () => {
            const isEnabledFromHash = hasHashParam(hashparam);
            if (isEnabledFromHash) {
                // If 'dev' is in the URL, enable debug view immediately
                console.log('Dev mode enabled from hash');
                setIsEnabled(true);
                await localForage.setItem(localForageKey, true);
            } else {
                // If 'dev' is not in the URL, check localForage
                const storedIsEnabled = await localForage.getItem(localForageKey);
                setIsEnabled(storedIsEnabled === true);
            }
        };

        checkHashAndStoredState();

        const toggleTweakpane = (event: KeyboardEvent) => {
            if (eventKeys.includes(event.key)) {
                // dev state should not be persited in URL when sharing
                setIsEnabled((prevState) => {
                    const newState = !prevState;
                    localForage.setItem(localForageKey, newState);
                    newState === false && removeHashParam(hashparam);
                    return newState;
                });
            }
        };
        window.addEventListener('keydown', toggleTweakpane);
        return () => {
            window.removeEventListener('keydown', toggleTweakpane);
        };
    }, [hashparam]);

    useEffect(() => {
        if (!paneRef.current && containerRef.current) {
            const pane = new Pane({
                title: 'Developer Options',
                container: containerRef.current,
            });
            paneRef.current = pane;

            const closeButton = pane.addButton({
                title: 'Close This Dev GUI',
                label: 'Toggle with F12 or ~',
            });
            closeButton.on('click', () => {
                disableTweakpane();
            });
        }

        return () => {
            if (paneRef.current) {
                paneRef.current.dispose();
                paneRef.current = null;
            }
        };
    }, [containerRef]);

    const { top, left, right } = position ?? {};

    console.log('RENDER: [DEBUG] TweakpaneProvider', isEnabled);

    return (
        <TweakpaneContext.Provider value={{ paneRef }}>
            <div
                ref={containerRef}
                id="tweakpane-container"
                style={{
                    position: 'absolute',
                    display: isEnabled ? 'block' : 'none',
                    top,
                    left,
                    right,
                    zIndex: 10000,
                }}
            />
            {children}
        </TweakpaneContext.Provider>
    );
};

export default TweakpaneProvider;
