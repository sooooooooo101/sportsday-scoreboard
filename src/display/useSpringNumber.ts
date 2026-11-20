import { useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect } from 'react'

/** Critically damped count-up; reduced-motion users get an instant change. */
export function useSpringNumber(target: number): MotionValue<number> {
  const reduce = useReducedMotion()
  const spring = useSpring(target, { bounce: 0, visualDuration: 0.4 })
  useEffect(() => {
    if (reduce) spring.jump(target)
    else spring.set(target)
  }, [target, reduce, spring])
  return useTransform(spring, v => Math.round(v))
}
