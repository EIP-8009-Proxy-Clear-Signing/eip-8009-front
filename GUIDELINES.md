# Engineering Guidelines

## Code Style

### General Principles

The code should be simple and straightforward, prioritizing readability and understandability. Consistency and predictability should be maintained across the codebase. In particular, this applies to naming, which should be systematic, clear, and concise.

Sometimes these guidelines may be broken if doing so brings significant efficiency gains, but explanatory comments should be added.

Modularity should be pursued, but not at the cost of the above priorities.

### TypeScript

TypeScript code should be written in a consistent format enforced by a linter, following the project's ESLint configuration.

* **Strict typing**: Avoid `any` types. Use proper type definitions, generics, and type guards where necessary.

* **Type exports**: Export types alongside their implementations when they may be useful to consumers.

  ```typescript
  export type Check = {
    token: string;
    balance: number | string;
    target: string;
  };
  
  export const useChecks = create<UseChecks>((set) => ({ ... }));
  ```

* **Enums**: Use TypeScript enums for fixed sets of values.

  ```typescript
  export enum EMode {
    'diffs' = 'diffs',
    'pre/post' = 'pre/post',
  }
  ```

* **Prefer `const` assertions** for literal types when appropriate.

* **Use template literal types** for string patterns like addresses:

  ```typescript
  type Address = `0x${string}`;
  ```

### React & Components

* **Functional components**: Use functional components with hooks exclusively.

* **Component file structure**: One component per file, named to match the component.

  ```
  components/
    tx-options.tsx       # Contains TxOptions component
    wallet-options.tsx   # Contains WalletOptions component
  ```

* **UI components**: Use the established shadcn/ui pattern for reusable UI components in `components/ui/`.

* **Custom hooks**: Extract reusable logic into custom hooks in the `hooks/` directory.

  ```typescript
  // hooks/use-checks.ts
  export const useChecks = create<UseChecks>((set) => ({ ... }));
  ```

* **Props typing**: Define prop types explicitly, preferring interfaces for extendable types.

  ```typescript
  interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'destructive' | 'outline';
    size?: 'default' | 'sm' | 'lg';
  }
  ```

### Styling

* **Tailwind CSS**: Use Tailwind CSS for all styling. Avoid inline styles and custom CSS unless absolutely necessary.

* **Class merging**: Use the `cn()` utility for conditional and merged class names.

  ```typescript
  import { cn } from '@/lib/utils';
  
  <div className={cn('base-class', isActive && 'active-class')} />
  ```

* **Component variants**: Use `class-variance-authority` (CVA) for component variants.

  ```typescript
  const buttonVariants = cva('base-styles', {
    variants: {
      variant: { default: '...', destructive: '...' },
      size: { default: '...', sm: '...', lg: '...' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  });
  ```

### Imports & Module Organization

* **Path aliases**: Use the `@/` path alias for imports from `src/`.

  ```typescript
  import { Header } from '@/components/common/header';
  import { cn } from '@/lib/utils';
  ```

* **Import order**: Group imports in the following order:
  1. React and React-related packages
  2. Third-party libraries
  3. Internal modules (using `@/` alias)
  4. Types (using `type` imports when possible)

* **Barrel exports**: Avoid deep barrel exports that may cause circular dependencies.

### Web3 Conventions

* **Chain-agnostic code**: Write code that works across supported chains. Use chain configuration from `config/chains.ts`.

* **Address handling**: Always validate and normalize addresses. Use viem's address utilities.

  ```typescript
  import { isAddress, getAddress } from 'viem';
  
  if (isAddress(input)) {
    const normalized = getAddress(input);
  }
  ```

* **BigInt handling**: Use `BigInt` for all token amounts and balances. Never use `Number` for values that may exceed JavaScript's safe integer range.

  ```typescript
  const amount = BigInt(value);
  const formatted = formatBalancePrecise(amount, decimals);
  ```

* **Error handling**: Wrap all blockchain calls in try-catch blocks with user-friendly error messages.

* **Transaction simulation**: Always simulate transactions before execution when possible.

## Documentation

For contributors, project guidelines and processes must be documented publicly.

For users, features must be abundantly documented. Documentation should include answers to common questions, solutions to common problems, and recommendations for critical decisions that the user may face.

All changes to the core codebase (excluding tests, auxiliary scripts, etc.) must be documented in a changelog, except for purely cosmetic or documentation changes.

### Code Comments

* **JSDoc comments**: Use JSDoc for exported functions, especially utility functions and hooks.

  ```typescript
  /**
   * Formats a bigint balance to a human-readable string with full precision.
   * @param value - The balance as a bigint
   * @param decimals - The token's decimal places
   * @returns Formatted string with decimal point
   */
  export const formatBalancePrecise = (value: bigint, decimals: number): string => {
    // ...
  };
  ```

* **Inline comments**: Add comments for complex logic, especially for Web3-specific operations.

## Peer Review

All changes must be submitted through pull requests and go through peer code review.

The review must be approached by the reviewer in a similar way as if it was an audit of the code in question (but importantly it is not a substitute for and should not be considered an audit).

Reviewers should enforce code and project guidelines.

External contributions must be reviewed separately by multiple maintainers.

### Review Checklist

- [ ] Code follows TypeScript and React conventions
- [ ] No `any` types without justification
- [ ] Proper error handling for async operations
- [ ] Web3 interactions handle edge cases (rejected transactions, network errors)
- [ ] UI is accessible and responsive
- [ ] No console.log statements in production code (use proper logging)

## Automation

Automation should be used as much as possible to reduce the possibility of human error and forgetfulness.

Examples of automation:

- **Linting**: ESLint runs on all TypeScript/TSX files.
- **Formatting**: Prettier ensures consistent code formatting.
- **Type checking**: TypeScript compilation catches type errors.
- **Dependency updates**: Keep dependencies up to date and monitor for vulnerabilities.
- **CI/CD**: Automated builds and deployments via GitHub Actions or similar.

## Pull Requests

Pull requests are squash-merged to keep the `main` branch history clean. The title of the pull request becomes the commit message, so it should be written in a consistent format:

1. Begin with a capital letter.
2. Do not end with a period.
3. Write in the imperative: "Add feature X" and not "Adds feature X" or "Added feature X".

This repository does not follow conventional commits, so do not prefix the title with "fix:" or "feat:".

Work in progress pull requests should be submitted as Drafts and should not be prefixed with "WIP:".

Branch names don't matter, and commit messages within a pull request mostly don't matter either, although they can help the review process.

---

# TypeScript & React Conventions

In addition to the general guidelines above, follow these specific conventions.

## File Naming

* **Components**: Use kebab-case for component files: `tx-options.tsx`, `wallet-options.tsx`.
* **Hooks**: Prefix with `use-`: `use-checks.ts`, `use-modal-promise.ts`.
* **Utilities**: Use kebab-case: `approval-utils.ts`, `balance-utils.ts`.
* **Types**: Co-locate types with their implementations, or use `.types.ts` suffix for standalone type files.

## State Management

* **Zustand stores**: Use Zustand for global state. Define stores in `hooks/` with clear type definitions.

  ```typescript
  export type UseChecks = {
    checks: { ... };
    setSlippage: (slippage: number) => void;
    // ...
  };
  
  export const useChecks = create<UseChecks>((set) => ({ ... }));
  ```

* **React Query**: Use TanStack Query for server state and caching blockchain data.

* **Local state**: Prefer `useState` for component-local state that doesn't need to be shared.

## Component Patterns

* **Composition over configuration**: Prefer composable components over heavily configured ones.

  ```typescript
  // Good: Composable
  <Card>
    <CardHeader>
      <CardTitle>Title</CardTitle>
    </CardHeader>
    <CardContent>Content</CardContent>
  </Card>
  
  // Avoid: Over-configured
  <Card title="Title" content="Content" showHeader={true} />
  ```

* **Forwarded refs**: UI components should forward refs when wrapping native elements.

  ```typescript
  const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, ...props }, ref) => {
      return (
        <button
          className={cn(buttonVariants({ variant, size }), className)}
          ref={ref}
          {...props}
        />
      );
    }
  );
  Button.displayName = 'Button';
  ```

## Error Handling

* **User-facing errors**: Display clear, actionable error messages via toast notifications (sonner).

* **Async boundaries**: Handle loading and error states explicitly in components.

  ```typescript
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  return <Content data={data} />;
  ```

* **Web3 errors**: Parse and translate common Web3 errors into user-friendly messages.

## Accessibility

* **Semantic HTML**: Use appropriate HTML elements (`button`, `a`, `nav`, etc.).
* **ARIA attributes**: Add ARIA labels to interactive elements without visible text.
* **Keyboard navigation**: Ensure all interactive elements are keyboard accessible.
* **Focus management**: Manage focus appropriately in modals and dynamic content.

## Performance

* **Memoization**: Use `useMemo` and `useCallback` judiciously for expensive computations and stable references.
* **Code splitting**: Use dynamic imports for large components or routes.
* **Avoid re-renders**: Structure state to minimize unnecessary re-renders.
