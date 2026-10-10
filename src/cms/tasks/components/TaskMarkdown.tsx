"use client";

import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./TaskMarkdown.module.css";

const markdownComponents: Components = {
  a: ({ children, href, title }) => (
    <a
      className={styles.link}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      title={title}
    >
      {children}
    </a>
  ),
  img: ({ alt }) => (
    <span className={styles.imagePlaceholder}>
      {alt ? `[imagen: ${alt}]` : "[imagen]"}
    </span>
  ),
  pre: ({ children }) => <pre className={styles.codeBlock}>{children}</pre>,
  table: ({ children }) => (
    <div className={styles.tableWrap}>
      <table>{children}</table>
    </div>
  ),
};

/** Renders task descriptions as safe Markdown without executing embedded HTML. */
export function TaskMarkdown({ children }: { children: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={defaultUrlTransform}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default TaskMarkdown;
