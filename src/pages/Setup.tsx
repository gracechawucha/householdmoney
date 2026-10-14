import { useState } from 'react'
import { ProjectsPanel } from './ProjectsPanel'
import { PresetsPanel } from './PresetsPanel'
import { CategoriesPanel } from './CategoriesPanel'
import { Segmented } from '../components/ui'

type Section = 'projects' | 'presets' | 'categories'

export function Setup() {
  const [section, setSection] = useState<Section>('projects')
  return (
    <div className="space-y-5">
      <div>
        <h1 className="px-1 text-[28px] font-extrabold tracking-tight">Projects &amp; presets</h1>
        <p className="px-1 text-sm text-mute">Set things up once. They behave from then on.</p>
      </div>

      <div className="flex">
        <Segmented
          value={section}
          onChange={setSection}
          options={[
            { value: 'projects', label: 'Projects' },
            { value: 'presets', label: 'Presets' },
            { value: 'categories', label: 'Categories' },
          ]}
        />
      </div>

      {section === 'projects' && <ProjectsPanel />}
      {section === 'presets' && <PresetsPanel />}
      {section === 'categories' && <CategoriesPanel />}
    </div>
  )
}
