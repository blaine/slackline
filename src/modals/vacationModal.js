/**
 * Build the vacation date picker modal
 */
export function buildVacationModal() {
  return {
    type: 'modal',
    callback_id: 'vacation_submission',
    title: {
      type: 'plain_text',
      text: 'Set Vacation Dates'
    },
    submit: {
      type: 'plain_text',
      text: 'Save'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Mark a date range as vacation days. Your streak won\'t be affected during this period.'
        }
      },
      {
        type: 'input',
        block_id: 'start_date_block',
        element: {
          type: 'datepicker',
          action_id: 'start_date',
          placeholder: {
            type: 'plain_text',
            text: 'Select start date'
          }
        },
        label: {
          type: 'plain_text',
          text: 'Start Date'
        }
      },
      {
        type: 'input',
        block_id: 'end_date_block',
        element: {
          type: 'datepicker',
          action_id: 'end_date',
          placeholder: {
            type: 'plain_text',
            text: 'Select end date'
          }
        },
        label: {
          type: 'plain_text',
          text: 'End Date'
        }
      }
    ]
  };
}
