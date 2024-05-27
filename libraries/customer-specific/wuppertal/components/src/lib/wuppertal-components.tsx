import styles from './wuppertal-components.module.css';

/* eslint-disable-next-line */
export interface WuppertalComponentsProps {}

export function WuppertalComponents(props: WuppertalComponentsProps) {
  return (
    <div className={styles['container']}>
      <h1>Welcome to WuppertalComponents!</h1>
    </div>
  );
}

export default WuppertalComponents;
