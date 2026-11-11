import { /* before */ createResource /* after */ } from "solid-js";
import { createResource as aliased } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

createResource(() => id, fetchUser);
// prettier-ignore
(createResource /* callee */)(...args);
aliased();
Solid.createResource();
Other.createResource();

const indirect = createResource;
indirect();

function shadowed(createResource: (...args: unknown[]) => unknown) {
  createResource();
}

void shadowed;

// Resource tuple member access patterns
const [user, { refetch, mutate }] = createResource(id, fetchUser);

user.loading;
user.error;
user();

refetch();
mutate({ name: "Alice" });

declare const otherObj: { loading: boolean; error: Error | null };
otherObj.loading;
otherObj.error;

export function Component() {
  const [posts] = createResource(page, fetchPosts);
  return (
    <div>
      <Show when={!posts.loading} fallback={<Spinner />}>
        <For each={posts()}>{(post) => <PostCard post={post()} />}</For>
      </Show>
      <Show when={posts.error}>
        {(err) => <p>Error: {err().message}</p>}
      </Show>
      <button onClick={() => posts.refetch()}>Reload</button>
      <button onClick={() => posts.mutate((p) => p)}>Optimistic</button>
    </div>
  );
}

