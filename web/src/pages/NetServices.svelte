<script lang="ts">
  import { untrack } from 'svelte'
  import { Config } from '../lib/config.svelte'
  import { fieldIds, type SectionDef } from '../lib/forms'
  import ConfigForm from '../components/ConfigForm.svelte'
  import Tabs from '../components/Tabs.svelte'

  type Service = 'mqtt' | 'mail' | 'telegram' | 'matrix'

  const forms: Record<Service, SectionDef[]> = {
    mqtt: [
      {
        fields: [
          { id: 'mqttHost', label: 'Server address' },
          { id: 'mqttPort', label: 'Server port' },
          { id: 'mqttUser', label: 'MQTT user' },
          { id: 'mqttPass', label: 'MQTT password', type: 'password' },
          { id: 'mqttLocation', label: 'Location' },
          { id: 'mqttDeviceName', label: 'Device name' },
          { id: 'mqttAutodiscoveryPrefix', label: 'Autodiscovery topic' },
          { id: 'mqttStatusInterval', label: 'Status interval (in seconds)' },
        ],
      },
    ],
    mail: [
      {
        title: 'SMTP server',
        fields: [
          { id: 'server', label: 'SMTP server' },
          { id: 'port', label: 'SMTP port' },
          { id: 'auth', label: 'Authentication user' },
          { id: 'pass', label: 'Authentication password', type: 'password' },
        ],
      },
      {
        title: 'Mail',
        fields: [
          { id: 'from', label: 'From' },
          { id: 'fromName', label: 'From name' },
          { id: 'to', label: 'Destination' },
          { id: 'subject', label: 'Subject' },
          { id: 'body', label: 'Body', wide: true },
          { id: 'numberOfPictures', label: 'Number of pictures' },
          { id: 'timeBetweenSnapshot', label: 'Time between pictures (in seconds)' },
          { id: 'quality', label: 'Compression quality (0 - 100, -1 for none)' },
        ],
      },
    ],
    telegram: [
      {
        fields: [
          { id: 'apiToken', label: 'API token', wide: true },
          { id: 'userChatID', label: 'User chat ID' },
        ],
      },
    ],
    matrix: [
      {
        fields: [
          { id: 'host', label: 'Server host' },
          { id: 'portM', label: 'Server port' },
          { id: 'roomID', label: 'Room ID' },
          { id: 'sender', label: 'Sender' },
          { id: 'accessToken', label: 'Access token', wide: true },
        ],
      },
    ],
  }

  const tabs: Record<Service, string> = { mqtt: 'MQTT', mail: 'Mail', telegram: 'Telegram', matrix: 'Matrix' }
  let tab = $state<Service>('mqtt')

  // Each service has its own configuration file, read when its tab is first opened
  const configs: Record<Service, Config> = {
    mqtt: new Config('ui_net_services.cgi', 'get_config_mqtt'),
    mail: new Config('ui_net_services.cgi', 'get_config_mail'),
    telegram: new Config('ui_net_services.cgi', 'get_config_telegram'),
    matrix: new Config('ui_net_services.cgi', 'get_config_matrix'),
  }
  const config = $derived(configs[tab])

  $effect(() => {
    // Only the tab is tracked: a failed load must not retry in a loop
    const current = config
    untrack(() => current.load())
  })
</script>

<section class="card">
  <h1>Network services</h1>
  <Tabs {tabs} bind:active={tab} />
  {#key tab}
    <ConfigForm
      sections={forms[tab]}
      bind:values={config.values}
      loading={config.loading}
      error={config.error}
      onsave={() => config.save(fieldIds(forms[tab]), `save_config_${tab}`)}
    />
  {/key}
</section>
